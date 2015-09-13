#!/usr/bin/env node

var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');
var hostname = require('os').hostname();

var async = require('async');
var daemon = require('daemon');

var pkg = require('./package.json');

/*
        yargs
 */
var yargs = require('yargs')

    .usage('pi2mqtt ' + pkg.version + '\n' + pkg.description + '\n\nUsage: $0 [options]')

    .describe('c', 'use config file')
    .describe('l', 'log to file')
    .describe('v', 'possible values: "error", "info", "debug"')
    .describe('d', 'don\'t fork into background and log to stdout. implies --verbosity debug')
    .describe('a', 'alias topics. can be used multiple times. See examples')
    .describe('i', 'use gpio as input. can be used multiple times. See examples')
    .describe('o', 'use gpio as output. can be used multiple times. See examples')
    .describe('p', 'type of the mqtt payload. possible values are "plain" and "json"')
    .describe('r', 'publish with retain flag')
    .describe('t', 'topic prefix for status messages')
    .describe('z', 'topic prefix for set messages')
    .describe('x', 'topic for connect and last will message')
    .describe('u', 'broker url. See https://github.com/mqttjs/MQTT.js#connect-using-a-url')
    .describe('s', 'seconds to wait before reading /sys/bus/w1/devices/')
    .describe('n', 'polling interval for 1-wire temperature sensors in seconds')
    .describe('w', 'disable 1-wire')
    .describe('h', 'show help')

    .example('$0 -w -i 17 -i 18 -o 23', 'Disable 1-Wire, use GPIO17/18 as inputs and GPIO23 as output')
    .example('$0 -t -o 17 -a w1/28-0000002981762:"Temperature/Garden" -a gpio/17:Light/Garden', 'Use 1-wire and GPIO17 as output. Set mqtt topic aliases and remove topic prefix')

    .alias({
        'd': 'debug',
        'h': 'help',
        'c': 'config',
        'l': 'log',
        'v': 'verbosity',
        'i': ['in', 'input'],
        'o': ['out', 'output'],
        'a': 'alias',
        'p': 'payload',
        'r': 'retain',
        'z': 'set-topic',
        't': 'status-topic',
        'u': 'url',
        'x': 'testament-topic',
        'w': 'w1-disable',
        's': 'w1-wait',
        'n': 'w1-interval'
    })

    .default({
        'u': 'mqtt://127.0.0.1',
        'c': '~/.pi2mqtt/config.json',
        'l': '~/.pi2mqtt/daemon.log',
        'p': 'plain',
        't': hostname + '/status/',
        'z': hostname + '/set/',
        'n': 30,
        's': 30,
        'v': 'error',
        'x': hostname + '/connected',
        'r': true
    })

    .config('config')
    .version('pi2mqtt ' + pkg.version + '\n', 'version')
    .help('help')

    .check(function (argv, aliases) {
        if (!argv.debug) daemon({stdout: process.stdout, stderr: process.stderr});
        if (argv.payload !== 'plain' && argv.payload !== 'json')        throw 'Error: payload type must be "plain" or "json"';
        if (typeof argv.w1Interval !== 'number' || argv.w1Interval < 1) throw 'Error: w1-interval has be a number greater than 0';
        if (typeof argv.w1Wait !== 'number')                            throw 'Error: w1-wait has to be a number';

    });

var config = yargs.argv;

if (config.debug) config.verbosity = 'debug';

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
    28: []
};

var values = {};

function w1Poll28() {
    async.map(w1Devices[28], w1Read28, function (err, results) {
        for (var i = 0; i < w1Devices[28].length; i++) {
            if (!results[i] || values[w1Devices[28][i]] == results[i]) continue;
            values[w1Devices[28][i]] = results[i];
            var topic = config.statusTopic + alias('w1/' + w1Devices[28][i]);
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

function w1Read28(sensor, cb) {
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
                }
                log.info('found ' + w1Devices[28].length + ' 1-Wire Temperature Sensors. Polling Interval '+ config.w1Interval + ' seconds');
                setInterval(w1Poll28, config.w1Interval * 1000);
                if (config.w1Interval > 5) w1Poll28();
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
