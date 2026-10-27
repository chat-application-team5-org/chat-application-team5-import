const http = require('http');
const WebSocket = require('ws');

jest.mock('../src/modules/messaging/messageService', () => ({ sendMessage: jest.fn() }));
const { sendMessage } = require('../src/modules/messaging/messageService');
const { attachGateway } = require('../src/ws/gateway');

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

beforeEach(() => sendMessage.mockReset());

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

describe('WebSocket gateway (CA-19, CA-22, CA-27)', () => {
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

  it('closes a connection when its auth token is missing or invalid', async () => {
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
