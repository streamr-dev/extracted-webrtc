#!/usr/bin/env node

const { spawn } = require('child_process')
const path = require('path')
const program = require('commander')

program
    .option('--nodes <nodes>', 'number of nodes', 10)
    .option('--signaller <signaller>', 'signaller-address', 'ws://127.0.0.1:8080')
    .option('--log-to-file <logToFile>', 'output logs to files', 'false')
    .option('--runSignaller <runSignaller>', 'enter anything to run signaller', undefined)
    .option('--signallerAddress <signallerAddress>', 'signaller address to run', '127.0.0.1')
    .option('--signallerPort <signallerPort>', 'signaller port to run', '8080')
    .option('--id <id>', 'node-id', 'node')
    .description('Run local WebRTC network')
    .parse(process.argv)

const { nodes: numberOfNodes } = program
const nodeId = program.id
const logToFile = program.logToFile

const startingDebugPort = 9200

let debug = false

const productionEnv = Object.create(process.env)
if (!productionEnv.DEBUG) {
    productionEnv.DEBUG = '*'
}
productionEnv.checkUncaughtException = true

// create signaller
const signaller = path.resolve('./signaller.js')
let args = [signaller, program.signallerAddress, program.signallerPort]

if (process.env.NODE_DEBUG_OPTION !== undefined) {
    debug = true
    args.unshift('--inspect-brk=' + (startingDebugPort - 1))
}

if (program.runSignaller) {
    spawn('node', args, {
        env: productionEnv,
        stdio: [process.stdin, process.stdout, process.stderr]
    })
}

setTimeout(() => {
        args = [
            path.resolve('./node.js'),
            `--node-id=${nodeId}`,
            `--connectionCount=${numberOfNodes}`,
            `--log-to-file=${logToFile}`,
            `--signaller=${program.signaller}`,
            '--report-interval=50000',
            '--publish-interval=10000',
            '--metrics-file=metrics'
        ]

        if (debug) {
            args.unshift('--inspect-brk=' + (startingDebugPort + i))
        }

        spawn('node', args, {
            env: productionEnv,
            stdio: [process.stdin, process.stdout, process.stderr]
        })
}, 1000)