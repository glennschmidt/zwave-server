#!/usr/bin/env node

/**
 * Author: Glenn Schmidt
 */

//Modules

var shellArgs = require('shell-arguments');
var bodyParser = require('body-parser');
var express = require('express');
var Map = require("collections/map");
var net = require('net');
var OZW = require('openzwave-shared');
var repl = require('repl');
var Set = require("collections/set");
var util = require('util');


//Local state

var nodes = new Map();
var replSockets = new Set();
var eventStreamSockets = new Set();
var httpListener = null;
var eventStreamListener = null;
var replListener = null;


//Constants

var ZW_NOTIFICATION_CODES = {
    0: 'Message complete',
    1: 'Timeout',
    2: 'No-op',
    3: 'Node is awake',
    4: 'Node is asleep',
    5: 'Node is dead',
    6: 'Node is alive'
};
var ZW_CONTROLLER_STATES = {
    0: 'No command in progress',
    1: 'The command is starting',
    2: 'The command was cancelled',
    3: 'Command invocation had error(s) and was aborted',
    4: 'Controller is waiting for a user action',
    5: 'Controller command is on a sleep queue wait for device',
    6: 'The controller is communicating with the other device to carry out the command',
    7: 'The command has completed successfully',
    8: 'The command has failed',
    9: 'The controller thinks the node is OK',
    10: 'The controller thinks the node has failed'
};
var ZW_CONTROLLER_ERRORS = {
    0: 'No error',
    1: 'ButtonNotFound',
    2: 'NodeNotFound',
    3: 'NotBridge',
    4: 'NotSUC',
    5: 'NotSecondary',
    6: 'NotPrimary',
    7: 'IsPrimary',
    8: 'NotFound',
    9: 'Busy',
    10: 'Failed',
    11: 'Disabled',
    12: 'Overflow'
};
var ZW_COMMAND_CLASSES = {
    0: 'no_operation',
    32: 'basic',
    33: 'controller_replication',
    34: 'application_status',
    35: 'zip_services',
    36: 'zip_server',
    37: 'switch_binary',
    38: 'switch_multilevel',
    39: 'switch_all',
    40: 'switch_toggle_binary',
    41: 'switch_toggle_multilevel',
    42: 'chimney_fan',
    43: 'scene_activation',
    44: 'scene_actuator_conf',
    45: 'scene_controller_conf',
    46: 'zip_client',
    47: 'zip_adv_services',
    48: 'sensor_binary',
    49: 'sensor_multilevel',
    50: 'meter',
    51: 'zip_adv_server',
    52: 'zip_adv_client',
    53: 'meter_pulse',
    60: 'meter_tbl_config',
    61: 'meter_tbl_monitor',
    62: 'meter_tbl_push',
    56: 'thermostat_heating',
    64: 'thermostat_mode',
    66: 'thermostat_operating_state',
    67: 'thermostat_setpoint',
    68: 'thermostat_fan_mode',
    69: 'thermostat_fan_state',
    70: 'climate_control_schedule',
    71: 'thermostat_setback',
    76: 'door_lock_logging',
    78: 'schedule_entry_lock',
    80: 'basic_window_covering',
    81: 'mtp_window_covering',
    96: 'multi_instance',
    98: 'door_lock',
    99: 'user_code',
    102: 'barrier_operator',
    112: 'configuration',
    113: 'alarm',
    114: 'manufacturer_specific',
    115: 'powerlevel',
    117: 'protection',
    118: 'lock',
    119: 'node_naming',
    122: 'firmware_update_md',
    123: 'grouping_name',
    124: 'remote_association_activate',
    125: 'remote_association',
    128: 'battery',
    129: 'clock',
    130: 'hail',
    132: 'wake_up',
    133: 'association',
    134: 'version',
    135: 'indicator',
    136: 'proprietary',
    137: 'language',
    138: 'time',
    139: 'time_parameters',
    140: 'geographic_location',
    141: 'composite',
    142: 'multi_instance_association',
    143: 'multi_cmd',
    144: 'energy_production',
    145: 'manufacturer_proprietary',
    146: 'screen_md',
    147: 'screen_attributes',
    148: 'simple_av_control',
    149: 'av_content_directory_md',
    150: 'av_renderer_status',
    151: 'av_content_search_md',
    152: 'security',
    153: 'av_tagging_md',
    154: 'ip_configuration',
    155: 'association_command_configuration',
    156: 'sensor_alarm',
    157: 'silence_alarm',
    158: 'sensor_configuration',
    239: 'mark',
    240: 'non_interoperable'
};


//Command-line arguments

if (!('i' in shellArgs) && !('s' in shellArgs))
{
    console.error('ZWave Server');
    console.error('Usage (interactive mode):');
    console.error('%s -i [options]', process.argv[1]);
    console.error('Usage (server mode):');
    console.error('%s -s [options]', process.argv[1]);
    console.error('');
    console.error('  ==Global options==');
    console.error('      --data-dir <path>');
    console.error('          The writable directory where log files and network state will be');
    console.error('          stored (defaults to /var/zwave-server)');
    console.error('');
    console.error('  ==Server-mode options==');
    console.error('      --device <device>');
    console.error('          The device file for communicating with the ZWave controller');
    console.error('          (default is /dev/ttyUSB0)');
    console.error('      --http <port>');
    console.error('          The TCP port or socket to listen on for HTTP requests (default is');
    console.error('          4280). Use this REST API to send commands, enumerate the ZWave');
    console.error('          network and fetch current device states.');
    console.error('      --events <port>');
    console.error('          The TCP port or socket to listen on for event stream connections');
    console.error('          (default is none). Connect to this port to be notified in real-time');
    console.error('          when there are state changes.');
    console.error('      --repl <port>');
    console.error('          The TCP port or socket to listen on for REPL connections (default is');
    console.error('          none). Connect to this port to troublehsoot or administer the ZWave');
    console.error('          network via a Node JS command-line interface.');
    console.error('');
    process.exit(1);
}
if (!('data-dir' in shellArgs))
    shellArgs['data-dir'] = '/var/zwave-server';
if (!('device' in shellArgs))
    shellArgs['device'] = '/dev/ttyUSB0';
if (!('http' in shellArgs))
    shellArgs['http'] = 4280;


//Configure Z-Wave driver
//Docs: https://github.com/OpenZWave/open-zwave/wiki/Config-Options

var zwaveConfig = {
    Logging: true,                  // enable logging to OZW_Log.txt
    ConsoleOutput: false,           // copy logging to the console
    SaveConfiguration: true,        // write an XML network layout
    DriverMaxAttempts: 3,           // try this many times before giving up
    PollInterval: 500,              // interval between polls in milliseconds
    SuppressValueRefresh: true,     // do not send updates if nothing changed
    UserPath: shellArgs['data-dir'],//This is the directory location where various files created by
                                    //the library are stored. Examples include the zwcfg_.xml and LogFiles_
    LogFileName: 'driver.log'       //The Log File Name to use (will be output in the UserPath Directory
};
var zwave = new OZW(zwaveConfig);


//Event handlers

process.on('SIGINT', function() {
    output.log('Shutting down...');
    zwave.disconnect();
    if (httpListener)
        httpListener.close();
    if (eventStreamListener)
        eventStreamListener.close();
    if (replListener)
        replListener.close();
    process.exit();
});

zwave.on('driver ready', function(homeid) {
    output.log('Connected to controller device');
    output.log('Beginning scan of home 0x%s', homeid.toString(16));
});

zwave.on('driver failed', function() {
    output.error('Failed to start driver. Exiting.');
    zwave.disconnect();
    process.exit(1);
});

zwave.on('node added', function(nodeid) {
    nodes.set(nodeid, {
        id: nodeid,
        manufacturer: '',
        manufacturerid: '',
        product: '',
        producttype: '',
        productid: '',
        type: '',
        name: '',
        loc: '',
        classes: {},
        ready: false
    });
    output.eventStream('node_added %d', nodeid);
});

zwave.on('value added', function(nodeid, comclass, value) {
    if (!nodes.has(nodeid))
        nodes.set(nodeid, {classes: {}});

    var node = nodes.get(nodeid);
    if (!(comclass in node.classes))
    {
        node.classes[comclass] = {
            id: comclass,
            name: ZW_COMMAND_CLASSES[comclass],
            values: {}
        };

        //We currently enable polling automatically for switch_multilevel
        if (comclass == 38)
            zwave.enablePoll(nodeid, comclass);
    }

    node.classes[comclass].values[value.index] = value;
});

zwave.on('value removed', function(nodeid, comclass, index) {
    if (!nodes.has(nodeid))
        return;

    var node = nodes.get(nodeid);
    if (node.classes[comclass] && node.classes[comclass].values[index])
        delete node.classes[comclass].values[index];
});

zwave.on('value changed', function(nodeid, comclass, value) {
    if (!nodes.has(nodeid))
        return;

    var node = nodes.get(nodeid);
    if (node.ready)
    {
        var oldValue = node.classes[comclass].values[value.index];
        if (oldValue.value != value.value)
        {
            output.log('[Node %d] %s: %s changed from %s to %s',
                nodeid,
                ZW_COMMAND_CLASSES[comclass],
                value['label'],
                oldValue.value,
                value.value
            );
            output.eventStream('value_changed %d %d %d %d %s %s', nodeid, comclass, value.instance,
                value.index, oldValue.value, value.value);
        }
    }
    node.classes[comclass].values[value.index] = value;
});

zwave.on('node ready', function(nodeid, nodeinfo) {
    if (!nodes.has(nodeid))
        return;

    var node = nodes.get(nodeid);
    if (node.ready)
        return;

    node.manufacturer = nodeinfo.manufacturer;
    node.manufacturerid = nodeinfo.manufacturerid;
    node.product = nodeinfo.product;
    node.producttype = nodeinfo.producttype;
    node.productid = nodeinfo.productid;
    node.type = nodeinfo.type;
    node.name = nodeinfo.name;
    node.loc = nodeinfo.loc;
    node.ready = true;

    output.log('[Node %d] Node is ready', nodeid);
    output.eventStream('node_ready %d', nodeid);
});

zwave.on('polling enabled', function(nodeid) {
    output.log('[Node %d] Polling enabled', nodeid);
});

zwave.on('polling disabled', function(nodeid) {
    output.log('[Node %d] Polling disabled', nodeid);
});

zwave.on('notification', function(nodeid, notif) {
    if (notif != 2) //nop
    {
        output.log('[Node %d] %s',
            nodeid,
            ZW_NOTIFICATION_CODES[notif]
        );
    }
});

zwave.on('controller command', function(state, error) {
    output.log('Controller command feedback: %s', ZW_CONTROLLER_STATES[state]);
    if (error)
        output.log('   %s',  ZW_CONTROLLER_ERRORS[error]);
});

zwave.on('scan complete', function() {
    output.log('Scan complete.');
});


//Utility functions

var output = {
    log: function() {
        var text = util.format.apply(util, arguments);
        console.log(text);
        replSockets.forEach(function(socket) {
            socket.write(text+"\r\n");
        });
    },
    error: function() {
        var text = util.format.apply(util, arguments);
        console.error(text);
        replSockets.forEach(function(socket) {
            socket.write(text+"\r\n");
        });
    },
    eventStream: function() {
        var text = util.format.apply(util, arguments);
        eventStreamSockets.forEach(function(socket) {
            socket.write(text+"\r\n");
        });
    }
};
var Writer = function(destination) {
    this.destination = destination;
};
Writer.prototype.log = function() {
    if (this.destination)
    {
        var text = util.format.apply(util, arguments);
        this.destination.write(text+"\n");
    }
    else
        output.log.apply(output, arguments);
};
var printNetwork = function(writer) {
    writer = writer || new Writer(null);

    var values = nodes.values();
    writer.log('There are %d registered nodes', values.length);
    for (var i = 0; i < values.length; i++)
    {
        var nodeInfo = values[i];
        writer.log(
            'Node %d - Manuf=%d, Prod=%d, Type=%d, Name=%s, Loc=%s',
            nodeInfo.id,
            nodeInfo.manufacturerid,
            nodeInfo.productid,
            nodeInfo.producttype,
            nodeInfo.name,
            nodeInfo.loc
        );
    }
};
var printNodeInfo = function(nodeid, writer) {
    writer = writer || new Writer(null);

    var nodeInfo = nodes.get(nodeid);
    writer.log(
         '   Manufacturer: %s\n'
        +'   Product: %s\n'
        +'   Name: %s\n'
        +'   Type: %s\n'
        +'   Location: %s',
        nodeInfo.manufacturer ? nodeInfo.manufacturer
            : 'id=' + nodeInfo.manufacturerid,
        nodeInfo.product ? nodeInfo.product
            : 'type=' + nodeInfo.producttype + ', id=' + nodeInfo.productid,
        nodeInfo.name,
        nodeInfo.type,
        nodeInfo.loc
    );

    for (var comclass in nodeInfo.classes)
    {
        if (ZW_COMMAND_CLASSES[comclass])
            writer.log('   Command class \'%s\':', ZW_COMMAND_CLASSES[comclass]);
        else
            writer.log('   Command class 0x%s:', comclass.toString(16));

        var values = nodeInfo.classes[comclass].values;
        for (var idx in values)
        {
            if (values[idx].hasOwnProperty('value'))
            {
                writer.log(
                    '      <%d:%d> %s = %s',
                    comclass,
                    idx,
                    values[idx]['label'],
                    values[idx]['value']
                );
            }
            else
            {
                writer.log(
                    '      <%d:%d> %s',
                    comclass,
                    idx,
                    values[idx]['label']
                );
            }
        }
    }
};
var getNodeClass = function(nodeId, classId) {
    if (!nodes.has(nodeId))
        return null;

    var node = nodes.get(nodeId);

    if (!(classId in node.classes))
    {
        //classId is not an ID, so see if it matches a class name instead
        for (var i in node.classes)
        {
            if (node.classes[i].name == classId)
            {
                classId = i;
                break;
            }
        }
    }

    if (classId in node.classes)
        return node.classes[classId];

    return null;
};
var getNodeClassValue = function(nodeId, classId, instance, index) {
    var classInfo = getNodeClass(nodeId, classId);
    if (!classInfo)
        return null;

    //Find the value with a matching instance number and index
    for (var idx in classInfo.values)
    {
        var value = classInfo.values[idx];
        if (value.instance == instance && value.index == index)
            return value;
    }
    return null;
};
var getNodeClassValueByLabel = function(nodeId, classId, paramLabel) {
    var classInfo = getNodeClass(nodeId, classId);
    if (!classInfo)
        return null;

    //Find the first value with a matching label
    for (var idx in classInfo.values)
    {
        var value = classInfo.values[idx];
        if (value.instance == 1 && value.label.toLowerCase() == paramLabel.toLowerCase())
            return value;
    }
    return null;
};


//Start listeners

if ('i' in shellArgs)
{
    //Interactive mode

    output.log('Interactive mode enabled');
    output.log('Example commands:');
    output.log('    zwave.connect(\'/dev/ttyUSB0\')');
    output.log('    zwave.setValue(nodeId, commandClass, instance, index, value)');
    output.log('    printNetwork()');
    output.log('    printNodeInfo(nodeId)');
    var replServer = repl.start({
        useColors: true,
        ignoreUndefined: true
    });
    replServer.context.zwave = zwave;
    replServer.context.printNetwork = printNetwork;
    replServer.context.printNodeInfo = printNodeInfo;
}
else
{
    //Server mode

    if ('repl' in shellArgs)
    {
        replListener = net.createServer(function(socket) {
            var remoteAddr = socket.remoteAddress+':'+socket.remotePort;
            console.log('Accepted REPL client connection from '+remoteAddr);
            replSockets.add(socket);
            socket.on('end', function() {
                replSockets.delete(socket);
                console.log('Closed REPL client connection with '+remoteAddr);
            });
            socket.write('ZWave server console\r\n');
            socket.write('Example commands:\r\n');
            socket.write('    zwave.setValue(nodeId, commandClass, instance, index, value)\r\n');
            socket.write('    printNetwork()\r\n');
            socket.write('    printNodeInfo(nodeId)\r\n');

            var replServer = repl.start({
                ignoreUndefined: true,
                input: socket,
                output: socket
            }).on('exit', function() {
                socket.end();
            });
            var writer = new Writer(socket);
            replServer.context.zwave = zwave;
            replServer.context.printNetwork = function() {
                printNetwork(writer);
            };
            replServer.context.printNodeInfo = function(nodeId) {
                printNodeInfo(nodeId, writer);
            };
        }).listen(shellArgs['repl'], function() {
            output.log('Started REPL listener ('+shellArgs['repl']+')');
        });
    }

    if ('events' in shellArgs)
    {
        eventStreamListener = net.createServer(function(socket) {
            var remoteAddr = socket.remoteAddress+':'+socket.remotePort;
            console.log('Accepted event stream connection from '+remoteAddr);
            eventStreamSockets.add(socket);
            socket.on('end', function() {
                eventStreamSockets.delete(socket);
                console.log('Closed event stream connection with '+remoteAddr);
            });
        }).listen(shellArgs['events'], function() {
            output.log('Started event stream listener ('+shellArgs['events']+')');
        });
    }

    var app = express();
    app.use(bodyParser.json());

    app.get('/', function(req, res) {
        res.send('ZWave Server API Endpoint');
    });
    app.get('/nodes', function(req, res) {
        res.json(nodes.values());
    });
    app.get('/nodes/:id', function(req, res) {
        var nodeId = parseInt(req.params.id);
        if (nodes.has(nodeId))
            res.json(nodes.get(nodeId));
        else
            res.sendStatus(404);
    });
    app.get('/nodes/:id/classes', function(req, res) {
        var nodeId = parseInt(req.params.id);
        if (nodes.has(nodeId))
        {
            var node = nodes.get(nodeId);
            res.json(node.classes);
        }
        else
            res.sendStatus(404);
    });
    app.get('/nodes/:id/classes/:class', function(req, res) {
        var nodeId = parseInt(req.params.id);
        var comclass = req.params.class;
        var classInfo = getNodeClass(nodeId, comclass);
        if (classInfo)
            res.json(classInfo);
        else
            res.sendStatus(404);
    });
    app.get('/nodes/:id/classes/:class/:param_name', function(req, res) {
        var nodeId = parseInt(req.params.id);
        var param = getNodeClassValueByLabel(nodeId, req.params.class, req.params.param_name);
        if (param)
            res.json(param);
        else
            res.sendStatus(404);
    });
    app.put('/nodes/:id/classes/:class/:param_name', function(req, res) {
        var nodeId = parseInt(req.params.id);
        var comclass = req.params.class;
        var classInfo = getNodeClass(nodeId, comclass);
        var param = getNodeClassValueByLabel(nodeId, comclass, req.params.param_name);
        if (classInfo && param && req.body && req.body.hasOwnProperty('value'))
        {
            var newVal = parseInt(req.body.value);
            zwave.setValue(nodeId, classInfo.id, param.instance, param.index, newVal);
            res.json(param);
        }
        else
            res.sendStatus(404);
    });
    app.get('/nodes/:id/classes/:class/:instance/:index', function(req, res) {
        var nodeId = parseInt(req.params.id);
        var param = getNodeClassValue(nodeId, req.params.class, req.params.instance, req.params.index);
        if (param)
            res.json(param);
        else
            res.sendStatus(404);
    });
    app.put('/nodes/:id/classes/:class/:instance/:index', function(req, res) {
        var nodeId = parseInt(req.params.id);
        var comclass = req.params.class;
        var classInfo = getNodeClass(nodeId, comclass);
        var param = getNodeClassValue(nodeId, comclass, req.params.instance, req.params.index);
        if (classInfo && param && req.body && req.body.hasOwnProperty('value'))
        {
            var newVal = parseInt(req.body.value);
            zwave.setValue(nodeId, classInfo.id, param.instance, param.index, newVal);
            res.json(param);
        }
        else
            res.sendStatus(404);
    });

    httpListener = app.listen(shellArgs['http'], function() {
        output.log('Started HTTP API listener ('+shellArgs['http']+')');
    });

    //Begin scanning for devices
    zwave.connect(shellArgs['device']);
}
