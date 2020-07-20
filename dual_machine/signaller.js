const WebSocket = require('ws')
const url = require('url')
const program = require('commander')

program
    .usage('<host> <port>')
    .description('Run example signaller')
    .parse(process.argv)

if (program.args.length < 2) {
    program.outputHelp()
    process.exit(1)
}

const host = program.args[0]
const port = parseInt(program.args[1], 10)

const wss = new WebSocket.Server({
    host,
    port
})

const nodeIdToWs = {}
const connectionIdToNodeId = {}
const neighbors = {}

wss.on('connection', (ws, req) => {
    // Parse id
    const parsed = url.parse(req.url, true)
    const { nodeId } = parsed.query
    if (nodeId === undefined) {
        ws.send(JSON.stringify({
            code: 'ERROR',
            errorCode: 'ID_NOT_GIVEN_IN_CONNECTION_URL'
        }))
        ws.close(1000, 'parameter "browserId" not supplied in query string')
        return
    }

    // Upon receiving message
    ws.on('message', (message) => {
        let payload
        try {
            payload = JSON.parse(message)
        } catch (e) {
            console.warn('Received malformed json from %s: %s.', id, message)
            ws.send(JSON.stringify({
                code: 'ERROR',
                errorCode: 'MALFORMED_JSON'
            }))
            return
        }

        if (payload.new) {
            const newConnectionId = payload.new
            connectionIdToNodeId[newConnectionId] = nodeId
            neighbors[newConnectionId] = ''

            Object.keys(neighbors).forEach((neighbor) => {
                if (neighbor === newConnectionId) {
                    return
                }
                if (neighbor.split('-')[0] === newConnectionId.split('-')[0]) {
                    return
                }
                if (neighbors[neighbor] === '' && !Object.values(neighbors).includes(newConnectionId)) {
                    neighbors[neighbor] = newConnectionId
                    neighbors[newConnectionId] = neighbor
                }
            })
            if (neighbors[newConnectionId]) {
                ws.send(JSON.stringify({
                    connId: newConnectionId,
                    connect: neighbors[newConnectionId]
                }))
                console.info('Sent connect %s to %s', neighbors[newConnectionId], newConnectionId)
            }

        } else {
            const {source, destination} = payload
            if (!Object.keys(connectionIdToNodeId).includes(destination)) {
                console.warn('Received message with unknown destination from %s: %s', source, destination)
                ws.send(JSON.stringify({
                    code: 'ERROR',
                    errorCode: 'UNKNOWN_TARGET_PEER_ID',
                    destination
                }))
                return
            }
            const destinationBrowser = connectionIdToNodeId[destination]
            nodeIdToWs[destinationBrowser].send(message)
            console.log('forwarded %s -> %s: %j', source, destination, payload)
        }
    })

    ws.on('close', () => {
        delete nodeIdToWs[nodeId]
        Object.keys(connectionIdToNodeId).forEach((nodeId) => {
            if (connectionIdToNodeId[nodeId] === nodeId) {
                delete connectionIdToNodeId[nodeId]
            }
        })
        console.info('%s disconnected.', nodeIdToWs)
    })

    nodeIdToWs[nodeId] = ws
    console.info('%s connected.', nodeId)
})