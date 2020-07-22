# Info

This branch can be used to run a signaller server + 2 or more processes that only for m connections to other processes.
It can also be used for remote testing between multiple machines.

## How to install

```
npm ci
```

## How to run
Start signaller
```sh
node signaller.js
```

Start each node (varying the node-id argument)
```
node node.js --node-id 1
```
```
node node.js --node-id 2
```
```
node node.js --node-id 3
```

## Running

To run a experiment locally open up to terminals.

On the other terminal enter:

```
node dual_machine/run.js --id first --runSignaller y --nodes 5
```

This runs a signaller + 5 connections that have a primary id of "first". The primary ID is used by the signaller to
makes sure that connections are only formed between peers of separate processes.

On the second terminal run:

```
node dual_machine/run.js --id second --nodes 5
```

You should now start seeing the nodes begin ICE. The node can be increased as much as the computer can handle but the
connections do not seems to stay stable when there are above 32 peerConnections even if the connecitons are formed
between two separate machines.