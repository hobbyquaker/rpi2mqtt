#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');

const async = require('async');
const daemon = require('daemon');

const pkg = require('./package.json');

const config = require('./config.js');

if (!config.debug) {
    daemon({stdout: process.stdout, stderr: process.stderr});
}

if (config.debug) {
    config.verbosity = 'debug';
}

/*
        Log
 */
if (typeof config.log === 'string' && typeof config.log !== '') {
    // Var logfile =
    const homedir = process.env.HOME;
    let logpath = path.dirname(config.log);
    const logfile = path.basename(config.log);
    if (logpath.slice(0, 2) == '~/') {
        logpath = homedir + '/' + logpath.slice(2);
    }
    logpath = path.resolve(logpath);
    config.log = logpath + '/' + logfile;
    if (!fs.existsSync(logpath)) {
        mkdirp(logpath, err => {
            if (!err) {
                log.debug('created folder ' + logpath);
            } else {
                // TODO
            }
        });
    }
}

function formatDate(dateObj) {
    if (!dateObj) {
        dateObj = new Date();
    }
    return dateObj.getFullYear() + '-' +
        ('0' + (dateObj.getMonth() + 1).toString(10)).slice(-2) + '-' +
        ('0' + (dateObj.getDate()).toString(10)).slice(-2) + ' ' +
        ('0' + (dateObj.getHours()).toString(10)).slice(-2) + ':' +
        ('0' + (dateObj.getMinutes()).toString(10)).slice(-2) + ':' +
        ('0' + (dateObj.getSeconds()).toString(10)).slice(-2);
}

var log = {
    debug(msg) {
        if (config.verbosity === 'debug') {
            log.log(msg);
        }
    },
    info(msg) {
        if (config.verbosity !== 'error') {
            log.log(msg);
        }
    },
    err(msg) {
        log.log(msg);
    },
    log(msg) {
        if (config.debug) {
            console.log(msg);
        }
        fs.appendFile(config.log, formatDate() + ' ' + msg + '\n', err => {
            // TODO
        });
    }
};

log.log('pi2mqtt ' + (config.debug ? '' : 'daemon ') + 'version ' + pkg.version + ' started with pid ' + process.pid);

/*
        MQTT
 */
const mqtt = require('mqtt');

if (typeof config.statusTopic !== 'string') {
    config.topic = '';
}
if (config.statusTopic !== '' && !config.statusTopic.match(/\/$/)) {
    config.statusTopic += '/';
}

if (typeof config.setTopic !== 'string') {
    config.setTopic = '';
}
if (config.setTopic !== '' && !config.setTopic.match(/\/$/)) {
    config.setTopic += '/';
}

log.debug('connecting ' + config.url);

let client;
let testamentPayload;
let connectPayload;

if (config.payload === 'json') {
    testamentPayload = JSON.stringify({val: false});
    connectPayload = JSON.stringify({val: true});
} else {
    testamentPayload = 'false';
    connectPayload = 'true';
}

if (config.testamentTopic && config.testamentTopic !== '') {
    client = mqtt.connect(config.url, {will: {topic: config.testamentTopic, payload: testamentPayload}});
    client.publish(config.testamentTopic, connectPayload);
} else {
    client = mqtt.connect(config.url);
}

const aliases = {};

if (typeof config.alias === 'string' && config.alias !== '') {
    config.alias = [config.alias];
}

if (config.alias) {
    for (var i = 0; i < config.alias.length; i++) {
        const tmp = config.alias[i].split(':');
        aliases[tmp[0]] = tmp[1];
        aliases[tmp[1]] = tmp[0];
    }
}

function alias(topic) {
    if (aliases[topic]) {
        topic = aliases[topic];
    }
    return topic;
}

/*
        GPIOs
 */
const Gpio = require('onoff').Gpio;

const io = {};

const inputState = {};

if (config.input) {
    if (typeof config.input === 'number') {
        config.input = [config.input];
    }
    for (var i = 0; i < config.input.length; i++) {
        io[config.input[i]] = new Gpio(config.input[i], 'in', 'both');
        (function () {
            const _i = i;
            io[config.input[_i]].watch((err, val) => {
                let payload;
                if (!err) {
                    switch (config.payload) {
                        case 'json':
                            payload = JSON.stringify({val: !val, ack: true});
                            break;
                        default:
                            payload = String(1 - val);
                    }
                    if (inputState[_i] !== val) {
                        inputState[_i] = val;
                        log.debug(config.statusTopic + alias('gpio/' + config.input[_i]) + ' ' + payload);
                        client.publish(config.statusTopic + alias('gpio/' + config.input[_i]), payload, {retain: Boolean(config.retain)});
                    }
                }
            });
        })();
    }
}

if (config.output) {
    if (typeof config.output === 'number') {
        config.output = [config.output];
    }

    for (var i = 0; i < config.output.length; i++) {
        io[config.output[i]] = new Gpio(config.output[i], 'out');
        const topic = config.setTopic + alias('gpio/' + config.output[i]);
        log.debug('mqtt subscribe ' + topic);
        client.subscribe(topic);
    }

    const rx = new RegExp(config.setTopic + 'gpio/([0-9]+)');

    client.on('message', (topic, message) => {
        topic = config.setTopic + alias(topic.slice(config.setTopic.length));

        log.debug('mqtt < ' + topic + ' ' + message);
        var tmp;
        if (tmp = topic.match(rx)) {
            const id = parseInt(tmp[1], 10);
            if (config.output.indexOf(id) !== -1) {
                let val;
                try {
                    var tmp = JSON.parse(message);
                    if (typeof tmp.val === 'undefined') {
                        throw 'attribute val missing';
                    } else {
                        val = Boolean(tmp.val);
                    }
                } catch (e) {
                    if (message === 'false') {
                        val = false;
                    } else if (message === 'true') {
                        val = true;
                    } else if (typeof message === 'string') {
                        val = parseInt(message, 10) || false;
                    } else {
                        val = Boolean(message);
                    }
                }
                val = val ? 1 : 0;
                io[id].writeSync(val);
            }
        }
    });
}

/*
        1-Wire
 */

const w1Devices = {
    28: [],
    10: []
};

const values = {};

function w1Poll(prefix) {
    async.map(w1Devices[prefix], w1Read, (err, results) => {
        for (let i = 0; i < w1Devices[prefix].length; i++) {
            if (!results[i] || values[w1Devices[prefix][i]] == results[i]) {
                continue;
            }
            values[w1Devices[prefix][i]] = results[i];
            const topic = config.statusTopic + alias('w1/' + w1Devices[prefix][i]);
            var payload;
            switch (config.payload) {
                case 'json':
                    payload = JSON.stringify({val: results[i]});
                    break;
                default:
                    payload = String(results[i]);

            }
            log.debug(topic + ' ' + payload);
            client.publish(topic, payload, {retain: Boolean(config.retain)});
        }
    });
}

function w1Read(sensor, cb) {
    fs.readFile('/sys/bus/w1/devices/' + sensor + '/w1_slave', (err, res) => {
        let tmp;
        if (!err && (tmp = res.toString().match(/YES\n[0-9a-f\s]+t=([0-9]+)\n/))) {
            cb(null, parseFloat(tmp[1]) / 1000);
        } else {
            // Don't give an error to the callback - this would stop async.map
            cb(null, null);
            log.err('error reading ' + sensor, err);
        }
    });
}

if (!config.w1Disable) {
    log.info('Waiting ' + config.w1Wait + ' seconds before reading /sys/bus/w1/devices/');

    setTimeout(() => {
        fs.readdir('/sys/bus/w1/devices/', (err, res) => {
            if (!err && res.length) {
                for (let i = 0; i < res.length; i++) {
                    if (res[i].match(/^28-/)) {
                        w1Devices[28].push(res[i]);
                    }
                    if (res[i].match(/^10-/)) {
                        w1Devices[10].push(res[i]);
                    }
                }
                log.info('found ' + (w1Devices[28].length + w1Devices[10].length) + ' 1-Wire Temperature Sensors. Polling Interval ' + config.w1Interval + ' seconds');
                setInterval(() => {
                    w1Poll(28); w1Poll(10);
                }, config.w1Interval * 1000);
                if (config.w1Interval > 5) {
                    w1Poll(28);
                    w1Poll(10);
                }
            } else {
                log.err('error reading dir /sys/bus/w1/devices', err);
                process.exit(1);
            }
        });
    }, config.w1Wait * 1000);
}

/*
        Stop process
 */
function stop(signal) {
    log.log('got ' + signal + ' - terminating.');

    // Todo unexport GPIOs?

    try {
        client.end(() => {
            log.debug('mqtt disconncted');
            process.exit(0);
        });
    } catch (e) {}

    setTimeout(() => {
        process.exit(0);
    }, 200);
}

process.on('SIGINT', () => {
    stop('SIGINT');
});
process.on('SIGTERM', () => {
    stop('SIGTERM');
});
