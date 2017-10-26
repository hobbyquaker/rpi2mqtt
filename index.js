#!/usr/bin/env node

const fs = require('fs');

const async = require('async');

const Gpio = require('onoff').Gpio;
const Mqtt = require('mqtt');
const log = require('yalm');

const pkg = require('./package.json');

const config = require('./config.js');

if (config.debug) {
    log.setLevel('debug');
}

log.info('rpi2mqtt version ' + pkg.version + ' started with pid ' + process.pid);

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

let mqtt;
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
    mqtt = Mqtt.connect(config.url, {will: {topic: config.testamentTopic, payload: testamentPayload}});
    mqtt.publish(config.testamentTopic, connectPayload);
} else {
    mqtt = Mqtt.connect(config.url);
}

const aliases = {};

if (typeof config.alias === 'string' && config.alias !== '') {
    config.alias = [config.alias];
}

if (config.alias) {
    for (let i = 0; i < config.alias.length; i++) {
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

const io = {};

const inputState = {};

if (config.input) {
    if (typeof config.input === 'number') {
        config.input = [config.input];
    }
    for (let i = 0; i < config.input.length; i++) {
        io[config.input[i]] = new Gpio(config.input[i], 'in', 'both');
        io[config.input[i]].watch((err, val) => {
            let payload;
            if (!err) {
                switch (config.payload) {
                    case 'json':
                        payload = JSON.stringify({val: !val, ack: true});
                        break;
                    default:
                        payload = String(1 - val);
                }
                if (inputState[i] !== val) {
                    inputState[i] = val;
                    log.debug(config.statusTopic + alias('gpio/' + config.input[i]) + ' ' + payload);
                    mqtt.publish(config.statusTopic + alias('gpio/' + config.input[i]), payload, {retain: Boolean(config.retain)});
                }
            }
        });
    }
}

if (config.output) {
    if (typeof config.output === 'number') {
        config.output = [config.output];
    }

    for (let i = 0; i < config.output.length; i++) {
        io[config.output[i]] = new Gpio(config.output[i], 'out');
        const topic = config.setTopic + alias('gpio/' + config.output[i]);
        log.debug('mqtt subscribe ' + topic);
        mqtt.subscribe(topic);
    }

    const rx = new RegExp(config.setTopic + 'gpio/([0-9]+)');

    mqtt.on('message', (topic, message) => {
        topic = config.setTopic + alias(topic.slice(config.setTopic.length));

        log.debug('mqtt < ' + topic + ' ' + message);
        let tmp = topic.match(rx);
        if (tmp) {
            const id = parseInt(tmp[1], 10);
            if (config.output.indexOf(id) !== -1) {
                let val;
                try {
                    tmp = JSON.parse(message);
                    if (typeof tmp.val === 'undefined') {
                        throw new TypeError('attribute val missing');
                    } else {
                        val = Boolean(tmp.val);
                    }
                } catch (err) {
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
            if (!results[i] || values[w1Devices[prefix][i]] === results[i]) {
                continue;
            }
            values[w1Devices[prefix][i]] = results[i];
            const topic = config.statusTopic + alias('w1/' + w1Devices[prefix][i]);
            let payload;
            switch (config.payload) {
                case 'json':
                    payload = JSON.stringify({val: results[i]});
                    break;
                default:
                    payload = String(results[i]);

            }
            log.debug(topic + ' ' + payload);
            mqtt.publish(topic, payload, {retain: Boolean(config.retain)});
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
            if (!err && res.length > 0) {
                for (let i = 0; i < res.length; i++) {
                    if (res[i].startsWith('28-')) {
                        w1Devices[28].push(res[i]);
                    }
                    if (res[i].startsWith('10-')) {
                        w1Devices[10].push(res[i]);
                    }
                }
                log.info('found ' + (w1Devices[28].length + w1Devices[10].length) + ' 1-Wire Temperature Sensors. Polling Interval ' + config.w1Interval + ' seconds');
                setInterval(() => {
                    w1Poll(28);
                    w1Poll(10);
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
    log.info('got ' + signal + ' - terminating.');

    // Todo unexport GPIOs?

    try {
        mqtt.end(() => {
            log.debug('mqtt disconncted');
            process.exit(0);
        });
    } catch (err) {}

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
