import sockets from "@src/sockets";

require('dotenv').config();

import logger from 'jet-logger';

import server from './server';
import * as http from 'http';
import * as WebSocket from 'ws';
import ChainService from "./services/ChainService";
import BuildQueueService from "@src/services/BuildQueueService";

// if(process.env.SPAM_FAUCET) ChainService.spamFaucet();
BuildQueueService.setup();

const httpServer = http.createServer(server);
const wss = new WebSocket.Server({ server:httpServer});

wss.on('connection', (ws: WebSocket) => sockets(ws));

httpServer.listen(process.env.WS_PORT || 3001, () => logger.info(`WS LIVE: ${process.env.WS_PORT || 3001}`));
server.listen(process.env.HTTP_PORT || 3000, () => logger.info(`HTTP LIVE: ${process.env.HTTP_PORT || 3000}`));
