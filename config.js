const hostname = require('os').hostname();

module.exports = require('yargs')

    .usage('Usage: $0 [options]')

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
    .version()
    .help('help')

    .check(function (argv, aliases) {
        if (argv.payload !== 'plain' && argv.payload !== 'json')        throw 'Error: payload type must be "plain" or "json"';
        if (typeof argv.w1Interval !== 'number' || argv.w1Interval < 1) throw 'Error: w1-interval has be a number greater than 0';
        if (typeof argv.w1Wait !== 'number')                            throw 'Error: w1-wait has to be a number';
        return true;
    })

    .argv;
