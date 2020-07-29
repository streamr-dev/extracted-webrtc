const fs = require('fs')

const tmp = require('tmp')
const WebSocket = require('ws')
const createDebug = require('debug')
// const { RTCPeerConnection, RTCSessionDescription } = require('wrtc')
const nodeDataChannel = require('./node-datachannel/lib/index');
const program = require('commander')
const EventEmitter = require('events');

const { logToFile } = require('./common')

program
    .option('--node-id <node-id>', 'node-id', null)
    .option('--signaller <signaller>', 'signaller host info', 'ws://127.0.0.1:8080')
    .option('--stun-urls <stun-urls>', 'comma-separated URL(s) of STUN servers', 'stun:stun.l.google.com:19302')
    .option('--publish-interval <publisher-interval>', 'interval in ms to publish', '2000')
    .option('--report-interval <report-interval>', 'interval in ms to report', '30000')
    .option('--metrics-file <metrics-file>', 'metrics log file to use', null)
    .option('--log-to-file <logToFile>', 'output logs to file', 'false')
    .option('--log-file <logFile>', 'name of log file', 'node.log')
    .description('Run WebRTC example node')
    .parse(process.argv)

if (program.logToFile === true || program.logToFile.toLowerCase() === 'true') {
    logToFile(program.logFile, process, true)
}

if (!program.nodeId) {
    console.error('nodeId option is mandatory')
    process.exit(1)
}

const nodeId = program.nodeId
const { signaller } = program
const stunUrls = program.stunUrls.split(',')
const publishInterval = parseInt(program.publishInterval, 10)
const reportInterval = parseInt(program.reportInterval, 10)
const metricsFile = program.metricsFile ? program.metricsFile : tmp.fileSync().name
const debug = createDebug('node.js')

console.info('Node ID:', nodeId)
console.info('Using STUN URL(s):', stunUrls)
console.info('Connecting to signaller', signaller)
console.info('Publish interval ms: ', publishInterval)
console.info('Report interval ms: ', reportInterval)
console.info('Metrics to file: ', metricsFile)
console.info('Logs to file: ', program.logFile)

const logFileStream = fs.createWriteStream(metricsFile, {
    flags: 'a'
})

const connections = {}
const dataChannels = {}
const readyChannels = new Set()

function setUpWebRtcConnection(targetPeerId, isOffering) {
    if (connections[targetPeerId]) {
        return
    }
    const configuration = {
        iceServers: stunUrls.map((url) => ({
            urls: url
        }))
    }

    const connection = new nodeDataChannel.PeerConnection(nodeId, configuration);

    connection.onStateChange((state) => {
        console.log(nodeId, "State:", state);
    });
    connection.onGatheringStateChange((state) => {
        console.log(nodeId, "GatheringState:", state);
    });

    connection.onLocalDescription((description, type) => {
        console.log(nodeId, "Description:", description);
        ws.send(JSON.stringify({
            source: nodeId,
            destination: targetPeerId,
            type,
            description
        }))

    })

    connection.onLocalCandidate((candidate, mid) => {
        console.log(nodeId, "Candidate:", candidate, mid);
        ws.send(JSON.stringify({
            source: nodeId,
            destination: targetPeerId,
            type: 'candidate',
            candidate,
            mid
        }))
    });

    if (isOffering) {
        console.log('Starting dataChannel')
        const dataChannel = connection.createDataChannel("test")
        dataChannel.onOpen(() => {
            console.log("Datachannel opened", nodeId)
            readyChannels[nodeId] = dataChannel
        })

        dataChannel.onMessage((message) => {
            console.log(message)
        })
        dataChannels[targetPeerId] = dataChannel
    }
    connection.onDataChannel((dataChannel) => {
        console.log("Got dataChannel")
        dataChannel.onMessage((message) => {
            console.log(message)
        })

        dataChannels[targetPeerId] = dataChannel
        readyChannels[nodeId] = dataChannel
    })

    connections[targetPeerId] = connection
}

function randomString(length) {
    let result = ''
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    const charactersLength = characters.length
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength))
    }
    return result
}

const ws = new WebSocket(signaller + '/?id=' + nodeId)
ws.on('open', () => {
    console.info('Connection established to signaller.')

    ws.on('message', async (message) => {
        message = JSON.parse(message)
        const { source, destination } = message
        if (message.connect) {
            setUpWebRtcConnection(message.connect, true)
        } else if (message.type === 'offer') {
            console.log("Offering....")
            setUpWebRtcConnection(source, false)
            await connections[source].setRemoteDescription(message.description, message.type)

        } else if (message.type === 'answer') {
            if (connections[source]) {
                console.log("Answering....")
                await connections[source].setRemoteDescription(message.description, message.type)
            } else {
                console.warn(`Unexpected RTC_ANSWER from ${source} with contents: ${message.description}`)
            }
        } else if (message.type === 'candidate') {
            if (connections[source]) {
                await connections[source].addRemoteCandidate(message.candidate, message.mid)
            } else {
                console.warn(`Unexpected ICE_CANDIDATE from ${source} with contents: ${message.candidate}`)
            }
        } else {
            const error = new Error(`RTC error ${message} while attempting to signal with ${source}`)
            console.warn(error)
        }
    })

    setInterval(() => {
        Object.values(dataChannels).forEach((dataChannel) => {
            if (readyChannels.has(dataChannel)) {
                const str = randomString(2048)
                try {
                    dataChannel.send(JSON.stringify({
                        str,
                        time: Date.now()
                    }))
                    numOfMessagesSent += 1
                    numOfBytesSent += 1
                } catch (e) {
                    console.error(e)
                }
            }
        })
    }, publishInterval)
})

ws.on('close', () => {
    logFileStream.end()
    console.error('Connection to signaller dropped.')
    process.exit(1)
})
