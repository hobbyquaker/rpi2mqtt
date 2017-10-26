#!/usr/bin/env node

var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');

var async = require('async');
var daemon = require('daemon');

var pkg = require('./package.json');

var config = require('./config.js');

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
    //var logfile =
    var homedir = process.env.HOME;
    var logpath = path.dirname(config.log);
    var logfile = path.basename(config.log);
    if (logpath.slice(0, 2) == '~/') logpath = homedir + '/' + logpath.slice(2);
    logpath = path.resolve(logpath);
    config.log = logpath + '/' + logfile;
    if (!fs.existsSync(logpath)) {

    mkdirp(logpath, function (err) {
            if (!err) {
                log.debug('created folder ' + logpath)
            } else {
                // TODO
            }
        });
    }

}

function formatDate(dateObj) {
    if (!dateObj) dateObj = new Date();
    return dateObj.getFullYear() + '-' +
        ("0" + (dateObj.getMonth() + 1).toString(10)).slice(-2) + '-' +
        ("0" + (dateObj.getDate()).toString(10)).slice(-2) + ' ' +
        ("0" + (dateObj.getHours()).toString(10)).slice(-2) + ':' +
        ("0" + (dateObj.getMinutes()).toString(10)).slice(-2) + ':' +
        ("0" + (dateObj.getSeconds()).toString(10)).slice(-2);
}

var log = {
    debug: function (msg) {
        if (config.verbosity === 'debug') {
            log.log(msg);
        }
    },
    info: function (msg) {
        if (config.verbosity !== 'error') {
            log.log(msg);
        }
    },
    err: function (msg) {
        log.log(msg);
    },
    log: function (msg) {
        if (config.debug) console.log(msg);
        fs.appendFile(config.log, formatDate() + ' ' + msg + '\n', function (err) {
            // TODO
        });
    }
};

log.log('pi2mqtt ' + (config.debug ? '' : 'daemon ') + 'version ' + pkg.version + ' started with pid ' + process.pid);


/*
        MQTT
 */
var mqtt = require('mqtt');

if (typeof config.statusTopic !== 'string') config.topic = '';
if (config.statusTopic !== '' && !config.statusTopic.match(/\/$/)) config.statusTopic = config.statusTopic + '/';

if (typeof config.setTopic !== 'string') config.setTopic = '';
if (config.setTopic !== '' && !config.setTopic.match(/\/$/)) config.setTopic = config.setTopic + '/';

log.debug('connecting ' + config.url);

var client;
var testamentPayload;
var connectPayload;

if (config.payload === 'json') {
    testamentPayload = JSON.stringify({val:false});
    connectPayload = JSON.stringify({val:true});
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

var aliases = {};

if (typeof config.alias === 'string' && config.alias !== '') config.alias = [config.alias];

if (config.alias) {
    for (var i = 0; i < config.alias.length; i++) {
        var tmp = config.alias[i].split(':');
        aliases[tmp[0]] = tmp[1];
        aliases[tmp[1]] = tmp[0];
    }
}

function alias(topic) {
    if (aliases[topic]) topic = aliases[topic];
    return topic;
}

/*
        GPIOs
 */
var Gpio = require('onoff').Gpio;
var io = {};

var inputState = {};

if (config.input) {
    if (typeof config.input === 'number') config.input = [config.input];
    for (var i = 0; i < config.input.length; i++) {
        io[config.input[i]] = new Gpio(config.input[i], 'in', 'both');
        (function () {
            var _i = i;
            io[config.input[_i]].watch(function (err, val) {
                var payload;
                if (!err) {
                    switch (config.payload) {
                        case 'json':
                            payload = JSON.stringify({val: !val, ack: true});
                            break;
                        default:
                            payload = '' + (1 - val);
                    }
                    if (inputState[_i] !== val) {
                        inputState[_i] = val;
                        log.debug(config.statusTopic + alias('gpio/' + config.input[_i]) + ' ' + payload);
                        client.publish(config.statusTopic + alias('gpio/' + config.input[_i]), payload, {retain: !!config.retain});
                    }
                }
            });

        })();
    }
}


if (config.output) {

    if (typeof config.output === 'number') config.output = [config.output];

    for (var i = 0; i < config.output.length; i++) {
        io[config.output[i]] = new Gpio(config.output[i], 'out');
        var topic = config.setTopic + alias('gpio/' + config.output[i]);
        log.debug('mqtt subscribe ' + topic);
        client.subscribe(topic);
    }


    var rx = new RegExp(config.setTopic + 'gpio/([0-9]+)');

    client.on('message', function (topic, message) {

        topic = config.setTopic + alias(topic.slice(config.setTopic.length));

        log.debug('mqtt < ' + topic + ' ' + message);
        var tmp;
        if (tmp = topic.match(rx)) {
            var id = parseInt(tmp[1], 10);
            if (config.output.indexOf(id) !== -1) {
                var val;
                try {
                    var tmp = JSON.parse(message);
                    if (typeof tmp.val === 'undefined') {
                        throw 'attribute val missing';
                    } else {
                        val = !!tmp.val;
                    }
                } catch (e) {
                    if (message === 'false') {
                        val = false;
                    } else if (message === 'true') {
                        val = true;
                    } else if (typeof message === 'string') {
                        val = parseInt(message, 10) || false;
                    } else {
                        val = !!message;
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

var w1Devices = {
    28: [],
    10: []
};

var values = {};

function w1Poll(prefix) {
    async.map(w1Devices[prefix], w1Read, function (err, results) {
        for (var i = 0; i < w1Devices[prefix].length; i++) {
            if (!results[i] || values[w1Devices[prefix][i]] == results[i]) continue;
            values[w1Devices[prefix][i]] = results[i];
            var topic = config.statusTopic + alias('w1/' + w1Devices[prefix][i]);
            var payload;
            switch (config.payload) {
                case 'json':
                    payload = JSON.stringify({val: results[i]});
                    break;
                default:
                    payload = '' + results[i];

            }
            log.debug(topic + ' ' + payload);
            client.publish(topic, payload, {retain: !!config.retain});
        }
    });
}

function w1Read(sensor, cb) {
    fs.readFile('/sys/bus/w1/devices/' + sensor + '/w1_slave', function (err, res) {
        var tmp;
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

    setTimeout(function () {
        fs.readdir('/sys/bus/w1/devices/', function (err, res) {

            if (!err && res.length) {
                for (var i = 0; i < res.length; i++) {

                    if (res[i].match(/^28-/)) {
                        w1Devices[28].push(res[i]);
                    }
                    if (res[i].match(/^10-/)) {
                        w1Devices[10].push(res[i]);
                    }
                }
                log.info('found ' + (w1Devices[28].length + w1Devices[10].length) + ' 1-Wire Temperature Sensors. Polling Interval '+ config.w1Interval + ' seconds');
                setInterval(function(){w1Poll(28);w1Poll(10);}, config.w1Interval * 1000);
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
        stop process
 */
function stop(signal) {
    log.log('got ' + signal + ' - terminating.');

    // todo unexport GPIOs?

    try {
        client.end(function () {
            log.debug('mqtt disconncted');
            process.exit(0);
        });
    } catch (e) {}


    setTimeout(function () {
        process.exit(0);
    }, 200);
}

process.on('SIGINT', function () {
    stop('SIGINT');
});
process.on('SIGTERM', function () {
    stop('SIGTERM');
});
