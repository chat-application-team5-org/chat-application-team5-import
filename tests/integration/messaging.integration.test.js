const http = require('http');
const os = require('os');
const WebSocket = require('ws');

if (!process.env.MONGO_URI) {
  throw new Error('Set MONGO_URI to a disposable test database before running integration tests.');
}

const databaseName = new URL(process.env.MONGO_URI).pathname.replace(/^\//, '');
if (!/^chatapp_test(?:_[a-z0-9_-]+)?$/i.test(databaseName)) {
  throw new Error('Integration tests may only run against a database named chatapp_test or chatapp_test_<suffix>.');
}

process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret';

const mongoose = require('mongoose');
const User = require('../../src/models/User');
const Conversation = require('../../src/models/Conversation');
const Message = require('../../src/models/Message');
const { createApp } = require('../../src/app');
const { attachGateway } = require('../../src/ws/gateway');

jest.setTimeout(30000);

let server;
let wss;
let baseUrl;
const sockets = new Set();

function startServer() {
  return new Promise((resolve, reject) => {
    server = http.createServer(createApp());
    wss = attachGateway(server, { allowedOrigin: 'http://localhost:3000' });
    server.once('error', reject);
    server.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
}

async function stopServer() {
  if (!server) return;
  for (const socket of sockets) socket.terminate();
  sockets.clear();
  await new Promise((resolve) => {
    wss.close(() => server.close(resolve));
  });
  server = null;
  wss = null;
}

async function requestJson(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = response.status === 204 ? null : await response.json();
  return { response, data };
}

function nextEvent(socket, type) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error(`Timed out waiting for WebSocket event ${type}`));
    }, 5000);
    function onMessage(raw) {
      const message = JSON.parse(raw.toString());
      if (message.type !== type) return;
      clearTimeout(timer);
      socket.off('message', onMessage);
      resolve(message.payload);
    }
    socket.on('message', onMessage);
  });
}

async function connectSocket(token) {
  const socket = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`, {
    origin: 'http://localhost:3000',
  });
  sockets.add(socket);
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  const authenticated = nextEvent(socket, 'auth:ok');
  socket.send(JSON.stringify({ type: 'auth', payload: { token } }));
  await authenticated;
  return socket;
}

beforeAll(async () => {
  // MongoDB Node driver 7.6+ can build empty client metadata in Jest's
  // CommonJS runtime unless its OS adapter is supplied explicitly.
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
    runtimeAdapters: { os },
  });
  await mongoose.connection.dropDatabase();
  await Promise.all([User.init(), Conversation.init(), Message.init()]);
  await startServer();
});

afterAll(async () => {
  await stopServer();
  if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('two authenticated clients exchange a persisted message and history survives an app restart', async () => {
  const registrationA = await requestJson('/api/auth/register', {
    method: 'POST', body: { username: 'Alice', email: 'alice@example.com', password: 'Secret123' },
  });
  const registrationB = await requestJson('/api/auth/register', {
    method: 'POST', body: { username: 'Bob', email: 'bob@example.com', password: 'Secret123' },
  });
  expect(registrationA.response.status).toBe(201);
  expect(registrationB.response.status).toBe(201);

  const loginA = await requestJson('/api/auth/login', {
    method: 'POST', body: { identifier: 'alice', password: 'Secret123' },
  });
  const loginB = await requestJson('/api/auth/login', {
    method: 'POST', body: { identifier: 'bob@example.com', password: 'Secret123' },
  });
  expect(loginA.response.status).toBe(200);
  expect(loginB.response.status).toBe(200);

  const opened = await requestJson('/api/conversations', {
    method: 'POST', token: loginA.data.token, body: { participantId: registrationB.data.userId },
  });
  expect(opened.response.status).toBe(200);
  const conversationId = String(opened.data.conversation._id);
  const bobConversations = await requestJson('/api/conversations', { token: loginB.data.token });
  expect(bobConversations.data).toEqual([
    expect.objectContaining({ conversationId, name: 'alice', type: 'PRIVATE' }),
  ]);

  const alice = await connectSocket(loginA.data.token);
  const bob = await connectSocket(loginB.data.token);
  const senderAck = nextEvent(alice, 'message:status');
  const recipientMessage = nextEvent(bob, 'message:new');
  alice.send(JSON.stringify({
    type: 'message:send',
    payload: { conversationId, content: 'Hello, Bob!', clientMsgId: 'integration-message-1' },
  }));

  const [ack, delivered] = await Promise.all([senderAck, recipientMessage]);
  expect(ack).toMatchObject({ clientMsgId: 'integration-message-1', status: 'SENT' });
  expect(delivered.message.content).toBe('Hello, Bob!');
  const saved = await Message.findById(ack.messageId);
  expect(saved).toMatchObject({ content: 'Hello, Bob!', status: 'SENT' });

  await stopServer();
  await startServer();
  const history = await requestJson(`/api/conversations/${conversationId}/messages`, { token: loginB.data.token });
  expect(history.response.status).toBe(200);
  expect(history.data.messages.map((message) => message.content)).toContain('Hello, Bob!');
});
