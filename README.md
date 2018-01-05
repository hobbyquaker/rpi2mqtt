# rpi2mqtt

[![mqtt-smarthome](https://img.shields.io/badge/mqtt-smarthome-blue.svg)](https://github.com/mqtt-smarthome/mqtt-smarthome)
[![NPM version](https://badge.fury.io/js/rpi2mqtt.svg)](http://badge.fury.io/js/rpi2mqtt)
[![Dependency Status](https://img.shields.io/gemnasium/hobbyquaker/rpi2mqtt.svg?maxAge=2592000)](https://gemnasium.com/github.com/hobbyquaker/rpi2mqtt)
[![Build Status](https://travis-ci.org/hobbyquaker/rpi2mqtt.svg?branch=master)](https://travis-ci.org/hobbyquaker/rpi2mqtt)
[![XO code style](https://img.shields.io/badge/code_style-XO-5ed9c7.svg)](https://github.com/sindresorhus/xo)
[![License][mit-badge]][mit-url]

> Connect RaspberryPi GPIOs and 1-Wire temperature sensors to MQTT 🍰🔘📡


## Install

Prerequisite: Node.js version 6.0 or above. I suggest to use https://github.com/tj/n to install a recent version of
Node.js.  

Install rpi2mqtt:
`$ sudo npm install -g rpi2mqtt`

To run rpi2mqtt in background and start on system boot I suggest to use [PM2](https://github.com/Unitech/pm2).


## Usage

````
Usage: rpi2mqtt [options]

Options:
  -c, --config         use config file                                                          [default: "~/.pi2mqtt/config.json"]
  -l, --log            log to file                                                              [default: "~/.pi2mqtt/daemon.log"]
  -v, --verbosity      possible values: "error", "info", "debug"                                [default: "error"]
  -a, --alias          alias topics. can be used multiple times. See examples                 
  -i, --in, --input    use gpio as input. can be used multiple times. See examples            
  -o, --out, --output  use gpio as output. can be used multiple times. See examples           
  -p, --payload        type of the mqtt payload. possible values are "plain" and "json"         [default: "plain"]
  -r, --retain         publish with retain flag                                               
  -t, --status-topic   topic prefix for status messages                                         [default: "hostname/status/"]
  -z, --set-topic      topic prefix for set messages                                            [default: "hostname/set/"]
  -x, --testament      topic for connect and last will message                                  [default: "connected"]
  -u, --url            broker url. See https://github.com/mqttjs/MQTT.js#connect-using-a-url    [default: "mqtt://127.0.0.1"]
  -s, --w1-wait        seconds to wait before reading /sys/bus/w1/devices/                      [default: 30]
  -n, --w1-interval    polling interval for 1-wire temperature sensors in seconds               [default: 30]
  -w, --w1-disable     disable 1-wire                                                         
  -h, --help           show help                                                              
  --version            Show version number     
  
  Examples:
    index.js -w -i 17 -i 18 -o 23             Disable 1-Wire, use GPIO17/18 as
                                              inputs and GPIO23 as output
    index.js -t -o 17 -a                      Use 1-wire and GPIO17 as output. Set
    w1/28-0000002981762:Temperature/Garden    mqtt topic aliases and remove topic
    -a gpio/17:Light/Garden                   prefix
                        
````


## MQTT Topics

Default prefix is the hostname. You can disable the topic prefix with empty option --topic

### 1-Wire Temperature Sensors (DS1820) 

`<prefix>/status/w1/<1-wire-serial>`

By default status topic is `<hostname>/status`, this can be changed through the command-line option `--status-topic`.

Example: `raspberry/status/w1/28-000005908b0e`


### GPIO Input

`<status-topic>/gpio/<gpio-number>`

Example: `raspberry/status/gpio/17`

### GPIO Output

`<set-topic>/gpio/<gpio-number>`

By default the set topic is `<hostname>/set`, this can be changed through the command-line option `--set-topic`.

Example: `raspberry/set/gpio/23`

The payload can be a plain number (`0`, `1`) or the strings `false` and `true`. 


### Aliases

You can set individual topics with the --alias option.   
Example: `rpi2mqtt -a w1/28-000005908b0e:Temperature/Garden`

If you want to use spaces in the topic use quotes around the whole -a option, like e.g. 
`-a "w1/28-0000012345:Temperature Garden"`.

Mind that aliases don't affect the configured prefix. So `rpi2mqtt -o 17 -a gpio/17:Light/Garden -t Raspberry5` would 
result in topic `Raspberry5/Light/Garden` for GPIO 17.

### Ideas/Todo

* Integrate https://github.com/hobbyquaker/piplate2mqtt
* PiFace
* Displays
* uart/spi/i2c?

## License

MIT Copyright (c) Sebastian Raff

[mit-badge]: https://img.shields.io/badge/License-MIT-blue.svg?style=flat
[mit-url]: LICENSE
