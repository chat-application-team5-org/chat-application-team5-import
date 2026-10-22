const jwt = require('jsonwebtoken');
const { WebSocketServer } = require('ws');
const config = require('../config');
const { sendMessage } = require('../modules/messaging/messageService');

const PING_INTERVAL_MS = 30000;
const MAX_PAYLOAD_BYTES = 4096;
const AUTH_TIMEOUT_MS = 5000;

function send(socket, type, payload) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ type, payload }));
}

function defaultAuthenticate(token) {
  const decoded = jwt.verify(token, config.jwtSecret);
  return String(decoded.sub || decoded.userId || decoded.id);
}

function attachGateway(server, {
  allowedOrigin,
  authenticate = defaultAuthenticate,
  authTimeoutMs = AUTH_TIMEOUT_MS,
}) {
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: MAX_PAYLOAD_BYTES,
    verifyClient: ({ origin }) => !origin || origin === allowedOrigin,
  });

  // userId -> set of that user's open sockets (CA-22)
  const online = new Map();

  function register(socket, userId) {
    socket.userId = userId;
    if (!online.has(userId)) online.set(userId, new Set());
    online.get(userId).add(socket);
  }

  function unregister(socket) {
    const sockets = online.get(socket.userId);
    if (!sockets) return;
    sockets.delete(socket);
    if (sockets.size === 0) online.delete(socket.userId);
  }

  async function handleSend(socket, payload = {}) {
    const { conversationId, content, clientMsgId } = payload;
    try {
      // Persisted first. Nothing below runs if the save fails.
      const { message, recipientIds } = await sendMessage({
        senderId: socket.userId,
        conversationId,
        content,
        clientMsgId,
      });

      send(socket, 'message:status', {
        clientMsgId,
        messageId: String(message._id),
        status: 'SENT',
      });

      recipientIds.forEach((id) => {
        (online.get(id) || []).forEach((s) => send(s, 'message:new', { message }));
      });
    } catch (err) {
      const known = Boolean(err.status && err.status < 500);
      send(socket, 'error', {
        code: known ? err.code : 'INTERNAL_ERROR',
        message: known ? err.message : 'Message could not be saved, please try again',
        clientMsgId,
      });
    }
  }

  wss.on('connection', (socket) => {
    socket.isAlive = true;
    const authTimeout = setTimeout(() => {
      if (socket.userId) return;
      send(socket, 'error', { code: 'AUTH_FAILED', message: 'Authenticate within 5 seconds' });
      socket.close(4401, 'AUTH_TIMEOUT');
    }, authTimeoutMs);
    socket.on('pong', () => {
      socket.isAlive = true;
    });
    socket.on('close', () => {
      clearTimeout(authTimeout);
      unregister(socket);
    });

    socket.on('message', async (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return send(socket, 'error', { code: 'VALIDATION_ERROR', message: 'Invalid JSON' });
      }

      if (msg.type === 'auth') {
        clearTimeout(authTimeout);
        try {
          register(socket, await authenticate(msg.payload && msg.payload.token));
          return send(socket, 'auth:ok', { userId: socket.userId });
        } catch {
          send(socket, 'error', { code: 'AUTH_FAILED', message: 'Authentication failed' });
          return socket.close(4401, 'AUTH_FAILED');
        }
      }

      if (!socket.userId) {
        send(socket, 'error', { code: 'AUTH_FAILED', message: 'Authenticate first' });
        return socket.close(4401, 'AUTH_FAILED');
      }

      if (msg.type === 'message:send') return handleSend(socket, msg.payload);

      return send(socket, 'error', { code: 'VALIDATION_ERROR', message: `Unsupported event: ${msg.type}` });
    });
  });

  const heartbeat = setInterval(() => {
    wss.clients.forEach((socket) => {
      if (!socket.isAlive) return socket.terminate();
      socket.isAlive = false;
      socket.ping();
    });
  }, PING_INTERVAL_MS);
  wss.on('close', () => clearInterval(heartbeat));

  return wss;
}

module.exports = { attachGateway };
