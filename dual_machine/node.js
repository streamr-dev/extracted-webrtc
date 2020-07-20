const fs = require('fs')

const tmp = require('tmp')
const WebSocket = require('ws')
const createDebug = require('debug')
const { RTCPeerConnection, RTCSessionDescription } = require('wrtc')
const program = require('commander')

const { logToFile } = require('../common')

program
    .option('--node-id <node-id>', 'node-id', null)
    .option('--connectionCount <connectionCount>', 'node count', '10')
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
const connectionCount = parseInt(program.connectionCount)
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

const peers = {}
let signallerWs = null
let numOfMessagesReceived = 0
let numOfBytesReceived = 0
let numOfMessagesSent = 0
let numOfBytesSent = 0
let totalLatency = 0.0
let lastReportedNumOfMessagesReceived = 0
let lastReportedNumofBytesReceived = 0
let lastReportedNumOfMessagesSent = 0
let lastReportedNumofBytesSent = 0
let lastReportedLatency = 0.0

function setUpWebRtcConnection(targetPeerId, isOffering, connId) {
    if (peers[connId].connections[targetPeerId]) {
        return
    }
    const configuration = {
        iceServers: stunUrls.map((url) => ({
            urls: url
        }))
    }
    const connection = new RTCPeerConnection(configuration)
    const dataChannel = connection.createDataChannel('streamrDataChannel', {
        id: 0,
        negotiated: true
    })

    if (isOffering) {
        connection.onnegotiationneeded = async () => {
            const offer = await connection.createOffer()
            await connection.setLocalDescription(offer)
            sendWsMessage(JSON.stringify({
                source: connId,
                destination: targetPeerId,
                offer
            }))
        }
    }

    connection.onconnectionstatechange = (event) => {
        console.log('onconnectionstatechange', connId, targetPeerId, connection.connectionState, event)
    }
    connection.onsignalingstatechange = (event) => {
        console.log('onsignalingstatechange', connId, targetPeerId, connection.connectionState, event)
    }
    connection.oniceconnectionstatechange = (event) => {
        console.log('oniceconnectionstatechange', connId, targetPeerId, event)
    }
    connection.onicegatheringstatechange = (event) => {
        console.log('onicegatheringstatechange', connId, targetPeerId, event)
    }

    dataChannel.onopen = (event) => {
        peers[connId].readyChannels.add(dataChannel)
    }

    dataChannel.onclose = (event) => {
        delete peers[connId].dataChannels[targetPeerId]
        peers[connId].readyChannels.delete(targetPeerId)
        peers[connId].connections[targetPeerId].close()
        delete peers[connId].connections[targetPeerId]

    }

    dataChannel.onerror = (event) => {
        console.log('dataChannel.onError', connId, targetPeerId, event)
        console.warn(event)
    }

    dataChannel.onmessage = (event) => {
        console.log('dataChannel.onmessage', connId, targetPeerId, event.data)
    }

    peers[connId].connections[targetPeerId] = connection
    peers[connId].dataChannels[targetPeerId] = dataChannel
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

function setUpSignallerConnection(nodeId) {
    signallerWs = new WebSocket(signaller + '/?nodeId=' + nodeId)
    signallerWs.on('open', () => {
        console.info('Connection established to signaller.')

        signallerWs.on('message', async (message) => {
            message = JSON.parse(message)
            const {source, destination, connId} = message
            if (message.connect) {
                setUpWebRtcConnection(message.connect, true, connId)
            } else if (message.offer) {
                setUpWebRtcConnection(source, false, destination)
                const description = new RTCSessionDescription(message.offer)
                await peers[destination].connections[source].setRemoteDescription(description)
                const answer = await peers[destination].connections[source].createAnswer()
                await peers[destination].connections[source].setLocalDescription(answer)
                sendWsMessage(JSON.stringify({
                    source: destination,
                    destination: source,
                    answer
                }))
            } else if (message.answer) {
                if (peers[destination].connections[source]) {
                    const description = new RTCSessionDescription(message.answer)
                    await peers[destination].connections[source].setRemoteDescription(description)
                } else {
                    console.warn(`Unexpected RTC_ANSWER from ${source} with contents: ${message.answer}`)
                }
            } else if (message.candidate) {
                if (peers[destination].connections[source]) {
                    await peers[destination].connections[source].addIceCandidate(message.candidate)
                } else {
                    console.warn(`Unexpected ICE_CANDIDATE from ${source} with contents: ${message.candidate}`)
                }
            } else {
                console.log(message)
                const error = new Error(`RTC error ${message} while attempting to signal with ${source}`)
                console.warn(error)
            }
        })
    })

    signallerWs.on('close', () => {
        logFileStream.end()
        console.error('Connection to signaller dropped.')
        process.exit(1)
    })
}

function sendWsMessage(msg) {
    // Wait until the state of the socket is not ready and send the message when it is...
    waitForSocketConnection(signallerWs, () => {
        signallerWs.send(msg);
    });
}

function waitForSocketConnection(socket, callback) {
    setTimeout(() => {
        if (socket.readyState === 1) {
            if (callback != null){
                callback();
            }
        } else {
            waitForSocketConnection(socket, callback);
        }
    }, 5);
}

function addConnToSignaller(connId) {
    try {
        sendWsMessage(JSON.stringify({
            new: connId
        }))
    } catch (e) {
        throw e
    }
}

async function handleConnects() {
    setUpSignallerConnection(nodeId)
    for (let i = 0; i < connectionCount; i++) {
        const connId = nodeId + "-" + i
        try {
            console.log(connId)
            addConnToSignaller(connId)
            peers[connId] = {
                connections: {},
                dataChannels: {},
                readyChannels: new Set(),
                publishInterval: publish(connId)
            }
            await sleep(100)
        } catch (e) {
            console.error(e)
        }
    }
}

function publish(connId) {
    return setInterval(() => {
        Object.values(peers[connId].dataChannels).forEach((dataChannel) => {
            if (peers[connId].readyChannels.has(dataChannel)) {
                const str = 'Hello world!'
                try {
                    dataChannel.send(JSON.stringify({
                        str,
                        time: Date.now()
                    }))
                } catch (e) {
                    console.error(e)
                }
            }
        })
    }, 15000)
}

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

handleConnects().then(() => {
    console.info('Initiation completed')
})
