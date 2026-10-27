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
  if (typeof token !== 'string' || !token.trim()) {
    throw new Error('A token is required');
  }
  if (!config.jwtSecret) {
    throw new Error('Authentication is not configured');
  }
  const decoded = jwt.verify(token, config.jwtSecret);
  const userId = decoded.sub || decoded.userId || decoded.id;
  if (!userId) throw new Error('Token does not identify a user');
  return String(userId);
}

function attachGateway(server, {
  allowedOrigin,
  authenticate = defaultAuthenticate,
  authTimeoutMs = AUTH_TIMEOUT_MS,
}) {
  // Browsers must send the configured Origin. Do not allow a missing Origin
  // to bypass the origin allow-list.
  const permittedOrigin = typeof allowedOrigin === 'string' && allowedOrigin.length > 0
    ? allowedOrigin
    : config.allowedOrigin;

  const wss = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: MAX_PAYLOAD_BYTES,
    verifyClient: ({ origin }, done) => {
      if (origin === permittedOrigin) return done(true);
      return done(false, 403, 'Forbidden origin');
    },
  });

  // userId -> set of that user's open sockets (CA-22)
  const online = new Map();

  function register(socket, userId) {
    socket.userId = userId;
    if (!online.has(userId)) online.set(userId, new Set());
    online.get(userId).add(socket);
  }

  function unregister(socket) {
    if (!socket.userId) return;
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

      if (msg && msg.type === 'auth') {
        if (socket.userId) {
          send(socket, 'error', { code: 'AUTH_ALREADY_COMPLETED', message: 'Connection is already authenticated' });
          return socket.close(4401, 'AUTH_ALREADY_COMPLETED');
        }

        try {
          const token = msg.payload && msg.payload.token;
          const userId = await authenticate(token);
          if (typeof userId !== 'string' || !userId.trim()) {
            throw new Error('Token did not resolve to a user');
          }
          register(socket, userId);
          clearTimeout(authTimeout);
          return send(socket, 'auth:ok', { userId: socket.userId });
        } catch {
          clearTimeout(authTimeout);
          send(socket, 'error', { code: 'AUTH_FAILED', message: 'Authentication failed' });
          return socket.close(4401, 'AUTH_FAILED');
        }
      }

      if (!socket.userId) {
        send(socket, 'error', { code: 'AUTH_FAILED', message: 'Authenticate first' });
        return socket.close(4401, 'AUTH_FAILED');
      }

      if (msg && msg.type === 'message:send') return handleSend(socket, msg.payload);

      return send(socket, 'error', {
        code: 'VALIDATION_ERROR',
        message: `Unsupported event: ${msg && msg.type}`,
      });
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
