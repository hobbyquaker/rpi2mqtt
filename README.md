# rpi2mqtt

[![License][mit-badge]][mit-url]
[![NPM version](https://badge.fury.io/js/rpi2mqtt.svg)](http://badge.fury.io/js/rpi2mqtt)
[![Dependency Status](https://img.shields.io/gemnasium/hobbyquaker/rpi2mqtt.svg?maxAge=2592000)](https://gemnasium.com/github.com/hobbyquaker/rpi2mqtt)
[![Build Status](https://travis-ci.org/hobbyquaker/rpi2mqtt.svg?branch=master)](https://travis-ci.org/hobbyquaker/rpi2mqtt)
[![XO code style](https://img.shields.io/badge/code_style-XO-5ed9c7.svg)](https://github.com/sindresorhus/xo)
[![License][mit-badge]][mit-url]

> Connect RaspberryPi GPIOs and 1-Wire temperature sensors to MQTT


## Install

Prerequisite: Node.js version 6.0 or above. I suggest to use https://github.com/tj/n to install a recent version of
Node.js.  

Install rpi2mqtt:
```sudo npm install -g rpi2mqtt```


## Usage

````
Usage: rpi2mqtt [options]

Options:
  -c, --config         use config file                                                          [default: "~/.pi2mqtt/config.json"]
  -l, --log            log to file                                                              [default: "~/.pi2mqtt/daemon.log"]
  -v, --verbosity      possible values: "error", "info", "debug"                                [default: "error"]
  -d, --debug          don't fork into background and log to stdout. implies --verbosity debug
  -a, --alias          alias topics. can be used multiple times. See examples                 
  -i, --in, --input    use gpio as input. can be used multiple times. See examples            
  -o, --out, --output  use gpio as output. can be used multiple times. See examples           
  -p, --payload        type of the mqtt payload. possible values are "plain" and "json"         [default: "plain"]
  -r, --retain         publish with retain flag                                               
  -t, --topic          topic prefix                                                             [default: "<hostname>"]
  -x, --testament      topic for connect and last will message                                  [default: "connected"]
  -u, --url            broker url. See https://github.com/mqttjs/MQTT.js#connect-using-a-url    [default: "mqtt://127.0.0.1"]
  -s, --w1-wait        seconds to wait before reading /sys/bus/w1/devices/                      [default: 30]
  -n, --w1-interval    polling interval for 1-wire temperature sensors in seconds               [default: 30]
  -w, --w1-disable     disable 1-wire                                                         
  -h, --help           show help                                                              
  --version            Show version number                             
````


## MQTT Topics

Default prefix is the hostname. You can disable the topic prefix with empty option --topic

### 1-Wire Temperature Sensors (DS1820) 

````
<prefix>/status/w1/<1-wire-serial>
````
Example: ```raspberrypi/status/w1/28-000005908b0e```

### GPIOs

Example input ```<prefix>/status/gpio/<gpio-number>```

### Aliases

You can set individual topics with the --alias option.   
Example: ```rpi2mqtt -a w1/28-000005908b0e:"Temperature/Garden"```

Mind that aliases don't affect the configured prefix. So ```rpi2mqtt -o 17 -a gpio/17:Garden -t Light``` would result in topic ```Light/Garden``` for GPIO17

### Ideas/Todo

* PiFace
* Displays
* uart/spi/i2c?

## License

MIT
Copyright (c) Sebastian

[mit-badge]: https://img.shields.io/badge/License-MIT-blue.svg?style=flat
[mit-url]: LICENSE
