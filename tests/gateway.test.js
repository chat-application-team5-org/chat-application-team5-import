const http = require('http');
const WebSocket = require('ws');

jest.mock('../src/modules/messaging/messageService', () => ({
  sendMessage: jest.fn(),
  loadPendingMessagesForRecipient: jest.fn(),
  markMessageDelivered: jest.fn(),
  markMessagesRead: jest.fn(),
}));
jest.mock('../src/models/User', () => ({
  findByIdAndUpdate: jest.fn().mockResolvedValue({}),
}));

jest.mock('../src/models/Conversation', () => ({
  findById: jest.fn(),
}));
const {
  sendMessage,
  loadPendingMessagesForRecipient,
  markMessageDelivered,
  markMessagesRead,
} = require('../src/modules/messaging/messageService');
const { attachGateway } = require('../src/ws/gateway');
const { publishGroupUpdate } = require('../src/modules/group/groupEvents');
const User = require('../src/models/User');
const Conversation = require('../src/models/Conversation');

let server;
let wss;
let port;

const ALLOWED_ORIGIN = 'http://localhost:3000';

// Test tokens are just the user id. "slow" simulates a delayed token verifier.
const authenticate = async (token) => {
  if (!token) throw new Error('no token');
  if (token === 'slow') await new Promise((resolve) => setTimeout(resolve, 250));
  return token;
};

beforeAll((done) => {
  server = http.createServer();
  wss = attachGateway(server, {
    allowedOrigin: ALLOWED_ORIGIN,
    authenticate,
    authTimeoutMs: 100,
    pingIntervalMs: 1000,
    pongTimeoutMs: 5000,
  });
  server.listen(0, () => {
    port = server.address().port;
    done();
  });
});

afterAll((done) => {
  wss.clients.forEach((c) => c.terminate());
  wss.close(() => server.close(done));
});

beforeEach(() => {
  sendMessage.mockReset();
  loadPendingMessagesForRecipient.mockReset().mockResolvedValue([]);
  markMessageDelivered.mockReset();
  markMessagesRead.mockReset();
  User.findByIdAndUpdate.mockReset().mockResolvedValue({});
  Conversation.findById.mockReset();
});

function connect({ origin = ALLOWED_ORIGIN } = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`, {
      ...(origin ? { origin } : {}),
    });
    ws.inbox = [];
    ws.closed = new Promise((resolveClose) => {
      ws.once('close', (code) => {
        ws.closeCode = code;
        resolveClose(code);
      });
    });
    ws.on('message', (raw) => ws.inbox.push(JSON.parse(raw.toString())));
    ws.on('open', () => resolve(ws));
    ws.on('unexpected-response', (_request, response) => {
      response.resume();
      reject(new Error(`WebSocket handshake rejected: ${response.statusCode}`));
    });
    ws.on('error', (error) => reject(error));
  });
}

const waitFor = async (ws, type) => {
  for (let i = 0; i < 100; i += 1) {
    const found = ws.inbox.find((m) => m.type === type);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`timed out waiting for ${type}`);
};

const login = async (userId) => {
  const ws = await connect();
  ws.send(JSON.stringify({ type: 'auth', payload: { token: userId } }));
  await waitFor(ws, 'auth:ok');
  return ws;
};

describe('WebSocket gateway (CA-19, CA-22, CA-27, CA-24)', () => {
  it('accepts the configured Origin and rejects an unconfigured Origin', async () => {
    const allowed = await connect();
    expect(allowed.readyState).toBe(WebSocket.OPEN);
    allowed.close();

    await expect(connect({ origin: 'https://evil.example' }))
      .rejects.toThrow('WebSocket handshake rejected: 403');
  });

  it('rejects a handshake with no Origin header', async () => {
    await expect(connect({ origin: null }))
      .rejects.toThrow('WebSocket handshake rejected: 403');
  });

  it('authenticates a valid token and returns auth:ok', async () => {
    const ws = await login('alice');
    expect(ws.inbox.find((m) => m.type === 'auth:ok').payload.userId).toBe('alice');
    ws.close();
  });

  it('closes a connection when its auth token is missing', async () => {
    const ws = await connect();
    ws.send(JSON.stringify({ type: 'auth', payload: {} }));
    const err = await waitFor(ws, 'error');
    expect(err.payload.code).toBe('AUTH_FAILED');
    expect(await ws.closed).toBe(4401);
  });

  it('rejects a second auth event after authentication', async () => {
    const ws = await login('alice');
    ws.send(JSON.stringify({ type: 'auth', payload: { token: 'bob' } }));
    const err = await waitFor(ws, 'error');
    expect(err.payload.code).toBe('AUTH_ALREADY_COMPLETED');
    expect(await ws.closed).toBe(4401);
  });

  it('does not authenticate a token after the authentication deadline expires', async () => {
    const ws = await connect();
    ws.send(JSON.stringify({ type: 'auth', payload: { token: 'slow' } }));
    expect(await ws.closed).toBe(4401);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(ws.inbox.some((message) => message.type === 'auth:ok')).toBe(false);
  });

  it('delivers a saved message to the online recipient and acks the sender', async () => {
    const alice = await login('alice');
    const bob = await login('bob');
    sendMessage.mockResolvedValue({ message: { _id: 'm1', content: 'Hi' }, recipientIds: ['bob'] });

    alice.send(JSON.stringify({ type: 'message:send', payload: { conversationId: 'c1', content: 'Hi', clientMsgId: 'x1' } }));

    const ack = await waitFor(alice, 'message:status');
    expect(ack.payload).toMatchObject({ clientMsgId: 'x1', messageId: 'm1', status: 'SENT' });
    const incoming = await waitFor(bob, 'message:new');
    expect(incoming.payload.message.content).toBe('Hi');
    alice.close();
    bob.close();
  });

  it('broadcasts a group message to every online recipient with the sender username', async () => {
    const alice = await login('alice');
    const bob = await login('bob');
    const charlie = await login('charlie');

    sendMessage.mockResolvedValue({
      message: {
        _id: 'group-message-1',
        content: 'Hello group',
        sender: { username: 'Alice' },
      },
      recipientIds: ['bob', 'charlie'],
    });

    try {
      alice.send(JSON.stringify({
        type: 'message:send',
        payload: {
          conversationId: 'group-conversation-1',
          content: 'Hello group',
          clientMsgId: 'group-client-1',
        },
      }));

      const [ack, bobIncoming, charlieIncoming] = await Promise.all([
        waitFor(alice, 'message:status'),
        waitFor(bob, 'message:new'),
        waitFor(charlie, 'message:new'),
      ]);

      expect(ack.payload).toMatchObject({
        clientMsgId: 'group-client-1',
        messageId: 'group-message-1',
        status: 'SENT',
      });

      for (const incoming of [bobIncoming, charlieIncoming]) {
        expect(incoming.payload.message).toMatchObject({
          _id: 'group-message-1',
          content: 'Hello group',
          sender: { username: 'Alice' },
        });
      }

      expect(sendMessage).toHaveBeenCalledWith({
        senderId: 'alice',
        conversationId: 'group-conversation-1',
        content: 'Hello group',
        clientMsgId: 'group-client-1',
      });
    } finally {
      alice.close();
      bob.close();
      charlie.close();
    }
  });

  it('replays pending messages after authentication', async () => {
    loadPendingMessagesForRecipient.mockResolvedValue([
      { _id: 'pending-1', content: 'Stored while offline' },
    ]);
    const bob = await login('bob');
    const replay = await waitFor(bob, 'message:new');
    expect(replay.payload.message).toMatchObject({ _id: 'pending-1', content: 'Stored while offline' });
    expect(loadPendingMessagesForRecipient).toHaveBeenCalledWith({ recipientId: 'bob' });
    bob.close();
  });

  it('marks a message delivered only after recipient acknowledgement and notifies the sender', async () => {
    const alice = await login('alice');
    const bob = await login('bob');
    markMessageDelivered.mockResolvedValue({
      message: { _id: 'm2', sender: 'alice', clientMsgId: 'x2' },
      newlyDelivered: true,
    });

    bob.send(JSON.stringify({ type: 'message:ack', payload: { messageId: 'm2' } }));

    const deliveryStatus = await waitFor(alice, 'message:status');
    expect(deliveryStatus.payload).toMatchObject({
      clientMsgId: 'x2',
      messageId: 'm2',
      status: 'DELIVERED',
    });
    expect(markMessageDelivered).toHaveBeenCalledWith({ recipientId: 'bob', messageId: 'm2' });
    alice.close();
    bob.close();
  });

  it('does not ack until the save has finished', async () => {
    const alice = await login('alice');
    let finishSave;
    sendMessage.mockReturnValue(new Promise((resolve) => { finishSave = resolve; }));

    alice.send(JSON.stringify({ type: 'message:send', payload: { conversationId: 'c1', content: 'Hi', clientMsgId: 'x2' } }));
    await new Promise((r) => setTimeout(r, 100));
    expect(alice.inbox.find((m) => m.type === 'message:status')).toBeUndefined();

    finishSave({ message: { _id: 'm2' }, recipientIds: [] });
    await waitFor(alice, 'message:status');
    alice.close();
  });

  it('sends an error and no ack or delivery when the save fails', async () => {
    const alice = await login('alice');
    const bob = await login('bob');
    sendMessage.mockRejectedValue(new Error('db down'));

    alice.send(JSON.stringify({ type: 'message:send', payload: { conversationId: 'c1', content: 'Hi', clientMsgId: 'x3' } }));

    const err = await waitFor(alice, 'error');
    expect(err.payload.code).toBe('INTERNAL_ERROR');
    expect(alice.inbox.find((m) => m.type === 'message:status')).toBeUndefined();
    expect(bob.inbox.find((m) => m.type === 'message:new')).toBeUndefined();
    alice.close();
    bob.close();
  });

  it('rejects message:send before authentication', async () => {
    const ws = await connect();
    ws.send(JSON.stringify({ type: 'message:send', payload: { conversationId: 'c1', content: 'Hi' } }));
    const err = await waitFor(ws, 'error');
    expect(err.payload.code).toBe('AUTH_FAILED');
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('closes a connection that does not authenticate within the deadline', async () => {
    const ws = await connect();
    expect(await ws.closed).toBe(4401);
    expect(ws.inbox.some((message) => message.payload && message.payload.message === 'Authenticate within 5 seconds')).toBe(true);
  });
});
describe('Online/offline presence (CA-33)', () => {
  test('broadcasts online status when a user authenticates', async () => {
    const alice = await login('alice');
    const bob = await login('bob');

    try {
      const presence = await waitFor(alice, 'presence:update');

      expect(presence.payload).toEqual({
        userId: 'bob',
        status: 'online',
        lastSeen: null,
      });
    } finally {
      alice.close();
      bob.close();
    }
    });
  test('broadcasts offline status and last-seen when a user disconnects', async () => {
    const alice = await login('alice');
    const bob = await login('bob');

    try {
      await waitFor(alice, 'presence:update');

      bob.close();

      let presence;

for (let i = 0; i < 100; i += 1) {
  presence = alice.inbox.find(
    (message) =>
      message.type === 'presence:update' &&
      message.payload.userId === 'bob' &&
      message.payload.status === 'offline'
  );

  if (presence) break;

  await new Promise((resolve) => setTimeout(resolve, 10));
}

expect(presence).toBeDefined();

      expect(presence.payload.userId).toBe('bob');
      expect(presence.payload.status).toBe('offline');
      expect(presence.payload.lastSeen).toEqual(expect.any(String));
      expect(Number.isNaN(Date.parse(presence.payload.lastSeen))).toBe(false);
    } finally {
      alice.close();
      if (bob.readyState === WebSocket.OPEN) bob.close();
    }
  });
    test('keeps a user online while another connection remains active', async () => {
    const alice = await login('alice');
    const bob1 = await login('presence-shared-user');
    const bob2 = await login('presence-shared-user');

    try {
      await waitFor(alice, 'presence:update');

      bob1.close();

      await bob1.closed;

      const prematureOffline = alice.inbox.some(
        (message) =>
          message.type === 'presence:update' &&
          message.payload.userId === 'presence-shared-user' &&
          message.payload.status === 'offline'
      );

      expect(prematureOffline).toBe(false);

      bob2.close();

      let offlinePresence;

      for (let i = 0; i < 100; i += 1) {
        offlinePresence = alice.inbox.find(
          (message) =>
            message.type === 'presence:update' &&
            message.payload.userId === 'presence-shared-user' &&
            message.payload.status === 'offline'
        );

        if (offlinePresence) break;

        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      expect(offlinePresence).toBeDefined();
    } finally {
      alice.close();
      if (bob1.readyState === WebSocket.OPEN) bob1.close();
      if (bob2.readyState === WebSocket.OPEN) bob2.close();
    }
  });
  test('sends existing online users to a newly connected user', async () => {    const alice = await login('alice');
    const bob = await login('bob');

    try {
      const presence = await waitFor(bob, 'presence:update');

      expect(presence.payload).toEqual({
        userId: 'alice',
        status: 'online',
        lastSeen: null,
      });
    } finally {
      alice.close();
      bob.close();
    }
  });
});

describe('Typing indicator (CA-34)', () => {
  test('sends typing updates only to other conversation members', async () => {
    const alice = await login('alice');
    const bob = await login('bob');
    const charlie = await login('charlie');

    const conversationId = '507f1f77bcf86cd799439011';

    Conversation.findById.mockResolvedValue({
      participants: ['alice', 'bob'],
    });

    try {
      alice.send(JSON.stringify({
        type: 'typing:start',
        payload: { conversationId },
      }));

      const typing = await waitFor(bob, 'typing:update');

      expect(typing.payload).toEqual({
        conversationId,
        userId: 'alice',
        status: 'typing',
      });

      expect(alice.inbox.some(
        (message) => message.type === 'typing:update'
      )).toBe(false);

      expect(charlie.inbox.some(
        (message) => message.type === 'typing:update'
      )).toBe(false);
    } finally {
      alice.close();
      bob.close();
      charlie.close();
    }
  });
  test('rejects typing events from users who are not conversation members', async () => {
    const alice = await login('alice');
    const charlie = await login('charlie');

    const conversationId = '507f1f77bcf86cd799439011';

    Conversation.findById.mockResolvedValue({
      participants: ['bob', 'charlie'],
  });

  try {
    alice.send(JSON.stringify({
      type: 'typing:start',
      payload: { conversationId },
    }));

    const error = await waitFor(alice, 'error');

    expect(error.payload.code).toBe('FORBIDDEN_NOT_MEMBER');

    expect(charlie.inbox.some(
      (message) => message.type === 'typing:update'
    )).toBe(false);
  } finally {
    alice.close();
    charlie.close();
  }
  });
  test('rejects typing events with an invalid conversation ID', async () => {
   const alice = await login('alice');

   try {
    alice.send(JSON.stringify({
      type: 'typing:start',
      payload: { conversationId: 'invalid-id' },
    }));

    const error = await waitFor(alice, 'error');

    expect(error.payload.code).toBe('VALIDATION_ERROR');
    expect(Conversation.findById).not.toHaveBeenCalled();
  } finally {
    alice.close();
  }
  });
});
describe('Heartbeat (CA-35)', () => {
  test('sends periodic ping frames and keeps responsive clients connected', async () => {
    const alice = await login('alice');

    try {
      const pingReceived = new Promise((resolve) => {
        alice.once('ping', resolve);
      });

      await pingReceived;

      await new Promise((resolve) => setTimeout(resolve, 600));

      expect(alice.readyState).toBe(WebSocket.OPEN);
    } finally {
      alice.close();
    }
  });
  test('terminates clients that do not respond with pong', async () => {
  const alice = await login('alice');
  alice._autoPong = false;

  try {
    alice.removeAllListeners('ping');

    alice.on('ping', () => {
      // Intentionally do not send pong.
    });

    const closeCode = await alice.closed;

    expect(closeCode).toBe(1006);
  } finally {
    if (alice.readyState === WebSocket.OPEN) {
      alice.terminate();
    }
  }
},10000);
test('broadcasts offline presence when an unresponsive user is terminated', async () => {
  const alice = await login('alice');
  const bob = await login('bob');

  try {
    alice._autoPong = false;

    const offline = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Offline presence was not broadcast'));
      }, 8000);

      bob.on('message', (raw) => {
        const message = JSON.parse(raw.toString());

        if (
          message.type === 'presence:update' &&
          message.payload.userId === 'alice' &&
          message.payload.status === 'offline'
        ) {
          clearTimeout(timeout);
          resolve(message);
        }
      });
    });

    const presence = await offline;

    expect(presence.payload.status).toBe('offline');
    expect(presence.payload.lastSeen).toEqual(expect.any(String));
   } finally {
    bob.close();
    if (alice.readyState === WebSocket.OPEN) {
      alice.terminate();
    }
  }
}, 12000);
});

describe('Group updates (CA-29)', () => {
  it('delivers group:update only to intended online participants', async () => {
    const alice = await login('alice');
    const bob = await login('bob');
    const charlie = await login('charlie');

    const payload = {
      action: 'ADDED',
      conversation: {
        conversationId: 'group-1',
        type: 'GROUP',
        name: 'Project Team',
        participants: ['alice', 'bob'],
      },
    };

    try {
      publishGroupUpdate('alice', payload);
      publishGroupUpdate('bob', payload);

      const aliceEvent = await waitFor(alice, 'group:update');
      const bobEvent = await waitFor(bob, 'group:update');

      expect(aliceEvent.payload).toEqual(payload);
      expect(bobEvent.payload).toEqual(payload);

      expect(
        charlie.inbox.some((message) => message.type === 'group:update')
      ).toBe(false);
    } finally {
      alice.close();
      bob.close();
      charlie.close();
    }
  });
});


describe('Read receipts (CA-37)', () => {
  it('broadcasts READ status to the original sender', async () => {
    const alice = await login('alice');
    const bob = await login('bob');
    markMessagesRead.mockResolvedValue({
      messages: [{ _id: 'm-read-1', sender: 'alice', clientMsgId: 'c-read-1' }],
      newlyRead: 1,
    });

    try {
      bob.send(JSON.stringify({
        type: 'message:read',
        payload: { conversationId: 'conversation-1', messageIds: ['m-read-1'] },
      }));
      const status = await waitFor(alice, 'message:status');
      expect(status.payload).toMatchObject({
        messageId: 'm-read-1', clientMsgId: 'c-read-1', status: 'READ',
      });
      expect(markMessagesRead).toHaveBeenCalledWith({
        readerId: 'bob', conversationId: 'conversation-1', messageIds: ['m-read-1'],
      });
    } finally {
      alice.close();
      bob.close();
    }
  });
});
