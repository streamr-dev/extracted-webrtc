#!/usr/bin/env node

const { spawn } = require('child_process')
const path = require('path')
const program = require('commander')

program
    .option('--nodes <nodes>', 'number of nodes', 10)
    .option('--log-to-file <logToFile>', 'output logs to files', 'false')
    .description('Run local WebRTC network')
    .parse(process.argv)

const { nodes: numberOfNodes } = program
const startingDebugPort = 9200
const logToFile = program.logToFile

let debug = false

const productionEnv = Object.create(process.env)
if (!productionEnv.DEBUG) {
    productionEnv.DEBUG = '*'
}
productionEnv.checkUncaughtException = true

// create signaller
const signaller = path.resolve('./signaller.js')
let args = [signaller, '0.0.0.0', '8080', '--log-to-file', logToFile]

if (process.env.NODE_DEBUG_OPTION !== undefined) {
    debug = true
    args.unshift('--inspect-brk=' + (startingDebugPort - 1))
}

spawn('node', args, {
    env: productionEnv,
    stdio: [process.stdin, process.stdout, process.stderr]
})

setTimeout(() => {
    for (let i = 0; i < numberOfNodes; i++) {
        args = [
            path.resolve('./node.js'),
            `--node-id=node-${i}`,
            '--report-interval=50000',
            '--publish-interval=10000',
            '--metrics-file=metrics',
            `--log-to-file=${logToFile}`
        ]

        if (debug) {
            args.unshift('--inspect-brk=' + (startingDebugPort + i))
        }

        spawn('node', args, {
            env: productionEnv,
            stdio: [process.stdin, process.stdout, process.stderr]
        })
    }
}, 1000)