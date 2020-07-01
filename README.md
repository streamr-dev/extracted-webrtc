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

## Run signaller + n amount of nodes

It is possible to run a signaller and n amount of nodes using the run.js script

```
node run.js --nodes 50 
```

All of the nodes will be running via a single run time with centralised logging.