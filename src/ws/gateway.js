const jwt = require('jsonwebtoken');
const { WebSocketServer } = require('ws');
const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const config = require('../config');
const User = require('../models/User');
const {
  sendMessage,
  loadPendingMessagesForRecipient,
  markMessageDelivered,
} = require('../modules/messaging/messageService');
const {
  markOnline,
  markOffline,
} = require('../modules/presence/presenceService');

const PING_INTERVAL_MS = 30000;
const PONG_TIMEOUT_MS = 10000;
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
  pingIntervalMs = PING_INTERVAL_MS,
  pongTimeoutMs = PONG_TIMEOUT_MS,
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

  if (!online.has(userId)) {
    online.set(userId, new Set());
  }

  const sockets = online.get(userId);
  const wasOffline = sockets.size === 0;
  sockets.add(socket);

  if (wasOffline) {
    markOnline(userId);
    broadcastPresence(userId, 'online');
  }
  for (const [onlineUserId] of online) {
   if (onlineUserId !== userId) {
    send(socket, 'presence:update', {
      userId: String(onlineUserId),
      status: 'online',
      lastSeen: null,
    });
  }
}

}



function unregister(socket) {
  if (!socket.userId) return;

  const userId = socket.userId;
  const sockets = online.get(userId);

  if (!sockets) return;

  sockets.delete(socket);

  if (sockets.size === 0) {
    online.delete(userId);

    const lastSeen = markOffline(userId);

    if (lastSeen) {
      if (/^[0-9a-fA-F]{24}$/.test(String(userId))) {
        void User.findByIdAndUpdate(userId, { lastSeen })
          .catch((error) => {
            console.error('Failed to update last-seen timestamp:', error.message);
          });
      }

      broadcastPresence(userId, 'offline', lastSeen);
    }
  }
}

function broadcastPresence(userId, status, lastSeen = null) {
  const payload = {
    userId: String(userId),
    status,
    lastSeen: lastSeen ? lastSeen.toISOString() : null,
  };

  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN && client.userId !== String(userId)) {
      send(client, 'presence:update', payload);
    }
  });
}

  async function replayPendingMessages(socket, userId) {
    try {
      const pending = await loadPendingMessagesForRecipient({ recipientId: userId });
      for (const message of pending) {
        if (socket.readyState !== socket.OPEN) break;
        send(socket, 'message:new', { message });
      }
    } catch {
      if (socket.readyState === socket.OPEN) {
        send(socket, 'error', {
          code: 'INTERNAL_ERROR',
          message: 'Pending messages could not be loaded. Open chat history to retry.',
        });
      }
    }
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

  async function handleDeliveryAck(socket, payload = {}) {
    try {
      const { message, newlyDelivered } = await markMessageDelivered({
        recipientId: socket.userId,
        messageId: payload.messageId,
      });
      if (!newlyDelivered) return;

      const senderId = String(message.sender);
      const deliveryStatus = {
        clientMsgId: message.clientMsgId,
        messageId: String(message._id),
        status: 'DELIVERED',
      };
      (online.get(senderId) || []).forEach((senderSocket) => {
        send(senderSocket, 'message:status', deliveryStatus);
      });
    } catch (err) {
      const known = Boolean(err.status && err.status < 500);
      send(socket, 'error', {
        code: known ? err.code : 'INTERNAL_ERROR',
        message: known ? err.message : 'Message delivery could not be confirmed',
      });
    }
  }

  wss.on('connection', (socket) => {
    socket.isAlive = true;
    socket.authPending = false;
    const authTimeout = setTimeout(() => {
      if (socket.userId) return;
      send(socket, 'error', { code: 'AUTH_FAILED', message: 'Authenticate within 5 seconds' });
      socket.close(4401, 'AUTH_TIMEOUT');
    }, authTimeoutMs);

   socket.on('pong', () => {
  socket.isAlive = true;
  clearTimeout(socket.pongTimeout);
  socket.pongTimeout = null;
});
   socket.on('close', () => {
  clearTimeout(authTimeout);
  clearTimeout(socket.pongTimeout);
  socket.pongTimeout = null;
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
        if (socket.userId || socket.authPending) {
          send(socket, 'error', {
            code: 'AUTH_ALREADY_COMPLETED',
            message: 'Authentication is already in progress or complete',
          });
          return socket.close(4401, 'AUTH_ALREADY_COMPLETED');
        }

        socket.authPending = true;
        try {
          const token = msg.payload && msg.payload.token;
          const userId = await authenticate(token);

          // A slow authenticator must not register a socket whose auth deadline
          // expired or whose client disconnected while verification was pending.
          if (socket.readyState !== socket.OPEN) return;
          if (typeof userId !== 'string' || !userId.trim()) {
            throw new Error('Token did not resolve to a user');
          }

          register(socket, userId);
          clearTimeout(authTimeout);
          send(socket, 'auth:ok', { userId: socket.userId });
          // Replay is asynchronous so auth:ok isn't held up by a history query.
          void replayPendingMessages(socket, userId);
          return;
        } catch {
          clearTimeout(authTimeout);
          if (socket.readyState === socket.OPEN) {
            send(socket, 'error', { code: 'AUTH_FAILED', message: 'Authentication failed' });
            socket.close(4401, 'AUTH_FAILED');
          }
          return;
        } finally {
          socket.authPending = false;
        }
      }

      if (!socket.userId) {
        send(socket, 'error', { code: 'AUTH_FAILED', message: 'Authenticate first' });
        return socket.close(4401, 'AUTH_FAILED');
      }

      if (msg && msg.type === 'message:send') return handleSend(socket, msg.payload);
      if (msg && msg.type === 'message:ack') return handleDeliveryAck(socket, msg.payload);
      if (msg && msg.type === 'typing:start') {
        const { conversationId } = msg.payload || {};

        if (!mongoose.isValidObjectId(conversationId)) {
         return send(socket, 'error', {
           code: 'VALIDATION_ERROR',
           message: 'A valid conversationId is required.',
         });
        }

  try {
    const conversation = await Conversation.findById(conversationId) ;

    if (!conversation) {
      return send(socket, 'error', {
        code: 'NOT_FOUND',
        message: 'Conversation not found.',
      });
    }

    const isMember = conversation.participants.some(
      (id) => String(id) === String(socket.userId)
    );

    if (!isMember) {
      return send(socket, 'error', {
        code: 'FORBIDDEN_NOT_MEMBER',
        message: 'You are not part of this conversation.',
      });
    }

    conversation.participants.forEach((participantId) => {
      const recipientId = String(participantId);

      if (recipientId === String(socket.userId)) return;

      (online.get(recipientId) || []).forEach((recipientSocket) => {
        send(recipientSocket, 'typing:update', {
          conversationId: String(conversationId),
          userId: String(socket.userId),
          status: 'typing',
        });
      });
    });
  } catch {
    return send(socket, 'error', {
      code: 'INTERNAL_ERROR',
      message: 'Typing status could not be sent.',
    });
  }

  return;
}

      return send(socket, 'error', {
        code: 'VALIDATION_ERROR',
        message: `Unsupported event: ${msg && msg.type}`,
      });
    });
  });
const heartbeat = setInterval(() => {
  wss.clients.forEach((socket) => {
    if (!socket.userId || socket.pongTimeout) return;

    socket.isAlive = false;
    socket.ping();

    socket.pongTimeout = setTimeout(() => {
      socket.pongTimeout = null;

      if (!socket.isAlive) {
        socket.terminate();
      }
    }, pongTimeoutMs);
  });
}, pingIntervalMs);

wss.on('close', () => {
  clearInterval(heartbeat);

  wss.clients.forEach((socket) => {
    clearTimeout(socket.pongTimeout);
    socket.pongTimeout = null;
  });
});


  return wss;
}

module.exports = { attachGateway };
