const http = require('http');
const WebSocket = require('ws');

jest.mock('../src/modules/messaging/messageService', () => ({
  sendMessage: jest.fn(),
  loadPendingMessagesForRecipient: jest.fn(),
  markMessageDelivered: jest.fn(),
}));
jest.mock('../src/models/User', () => ({
  findByIdAndUpdate: jest.fn().mockResolvedValue({}),
}));
const {
  sendMessage,
  loadPendingMessagesForRecipient,
  markMessageDelivered,
} = require('../src/modules/messaging/messageService');
const { attachGateway } = require('../src/ws/gateway');
const User = require('../src/models/User');

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
  User.findByIdAndUpdate.mockReset().mockResolvedValue({});
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
    const bob1 = await login('bob');
    const bob2 = await login('bob');

    try {
      await waitFor(alice, 'presence:update');

      bob1.close();

      await new Promise((resolve) => setTimeout(resolve, 50));

      const prematureOffline = alice.inbox.some(
        (message) =>
          message.type === 'presence:update' &&
          message.payload.userId === 'bob' &&
          message.payload.status === 'offline'
      );

      expect(prematureOffline).toBe(false);

      bob2.close();

      let offlinePresence;

      for (let i = 0; i < 100; i += 1) {
        offlinePresence = alice.inbox.find(
          (message) =>
            message.type === 'presence:update' &&
            message.payload.userId === 'bob' &&
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