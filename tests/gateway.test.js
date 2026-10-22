const http = require('http');
const WebSocket = require('ws');

jest.mock('../src/modules/messaging/messageService', () => ({ sendMessage: jest.fn() }));
const { sendMessage } = require('../src/modules/messaging/messageService');
const { attachGateway } = require('../src/ws/gateway');

let server;
let wss;
let port;

// Test tokens are just the user id.
const authenticate = async (token) => {
  if (!token) throw new Error('no token');
  return token;
};

beforeAll((done) => {
  server = http.createServer();
  wss = attachGateway(server, { allowedOrigin: 'http://localhost:3000', authenticate, authTimeoutMs: 100 });
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

function connect() {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    ws.inbox = [];
    ws.on('message', (raw) => ws.inbox.push(JSON.parse(raw.toString())));
    ws.on('open', () => resolve(ws));
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

describe('WebSocket gateway (CA-22, CA-27)', () => {
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
    const code = await new Promise((resolve) => ws.once('close', (closeCode) => resolve(closeCode)));
    expect(code).toBe(4401);
    expect(ws.inbox.some((message) => message.payload && message.payload.message === 'Authenticate within 5 seconds')).toBe(true);
  });
});
