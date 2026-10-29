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

function nextEvent(socket, type, predicate = () => true) {
  const existingIndex = socket.inbox.findIndex(
    (message) => message.type === type && predicate(message.payload)
  );
  if (existingIndex >= 0) return Promise.resolve(socket.inbox.splice(existingIndex, 1)[0].payload);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error(`Timed out waiting for WebSocket event ${type}`));
    }, 5000);
    function onMessage(raw) {
      const message = JSON.parse(raw.toString());
      if (message.type !== type || !predicate(message.payload)) return;
      clearTimeout(timer);
      socket.off('message', onMessage);
      const queuedIndex = socket.inbox.findIndex(
        (queued) => queued.type === type && predicate(queued.payload)
      );
      if (queuedIndex >= 0) socket.inbox.splice(queuedIndex, 1);
      resolve(message.payload);
    }
    socket.on('message', onMessage);
  });
}

async function connectSocket(token) {
  const socket = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`, {
    origin: 'http://localhost:3000',
  });
  socket.inbox = [];
  socket.on('message', (raw) => socket.inbox.push(JSON.parse(raw.toString())));
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

test('offline messages replay after reconnect, are acknowledged once, and survive restart', async () => {
  const registrationA = await requestJson('/api/auth/register', {
    method: 'POST', body: { username: 'Alice', email: 'alice@example.com', password: 'Secret123' },
  });
  const registrationB = await requestJson('/api/auth/register', {
    method: 'POST', body: { username: 'Bob', email: 'bob@example.com', password: 'Secret123' },
  });
  const registrationC = await requestJson('/api/auth/register', {
    method: 'POST', body: { username: 'Charlie', email: 'charlie@example.com', password: 'Secret123' },
  });
  expect(registrationA.response.status).toBe(201);
  expect(registrationB.response.status).toBe(201);
  expect(registrationC.response.status).toBe(201);

  const loginA = await requestJson('/api/auth/login', {
    method: 'POST', body: { identifier: 'alice', password: 'Secret123' },
  });
  const loginB = await requestJson('/api/auth/login', {
    method: 'POST', body: { identifier: 'bob@example.com', password: 'Secret123' },
  });
  const loginC = await requestJson('/api/auth/login', {
    method: 'POST', body: { identifier: 'charlie', password: 'Secret123' },
  });
  expect(loginA.response.status).toBe(200);
  expect(loginB.response.status).toBe(200);
  expect(loginC.response.status).toBe(200);

  const opened = await requestJson('/api/conversations', {
    method: 'POST', token: loginA.data.token, body: { participantId: registrationB.data.userId },
  });
  expect(opened.response.status).toBe(200);
  const conversationId = String(opened.data.conversation._id);

  // Bob is offline. The message must be persisted and remain pending.
  const alice = await connectSocket(loginA.data.token);
  const offlineSent = nextEvent(alice, 'message:status', (p) => p.clientMsgId === 'offline-message-1');
  alice.send(JSON.stringify({
    type: 'message:send',
    payload: { conversationId, content: 'Offline hello', clientMsgId: 'offline-message-1' },
  }));
  const sentStatus = await offlineSent;
  expect(sentStatus.status).toBe('SENT');
  const pendingBeforeRestart = await Message.findById(sentStatus.messageId);
  expect(pendingBeforeRestart).toMatchObject({ content: 'Offline hello', status: 'SENT' });

  // A real server restart must not lose the stored pending message.
  await stopServer();
  await startServer();

  const aliceAfterRestart = await connectSocket(loginA.data.token);
  const bob = await connectSocket(loginB.data.token);
  const replay = await nextEvent(
    bob,
    'message:new',
    (p) => p.message && p.message.clientMsgId === 'offline-message-1'
  );
  expect(replay.message.content).toBe('Offline hello');
  expect(String(replay.message._id)).toBe(String(sentStatus.messageId));

  const offlineDelivery = nextEvent(
    aliceAfterRestart,
    'message:status',
    (p) => p.clientMsgId === 'offline-message-1' && p.status === 'DELIVERED'
  );
  bob.send(JSON.stringify({ type: 'message:ack', payload: { messageId: sentStatus.messageId } }));
  await offlineDelivery;
  expect(await Message.findById(sentStatus.messageId)).toMatchObject({ status: 'DELIVERED' });

  // A later reconnect must not replay a message already acknowledged.
  bob.close();
  await new Promise((resolve) => bob.once('close', resolve));
  const bobAgain = await connectSocket(loginB.data.token);
  await new Promise((resolve) => setTimeout(resolve, 250));
  expect(bobAgain.inbox.some(
    (event) => event.type === 'message:new'
      && event.payload.message
      && event.payload.message.clientMsgId === 'offline-message-1'
  )).toBe(false);

  // Online delivery still works; the receiver's acknowledgement updates the sender.
  const liveSent = nextEvent(
    aliceAfterRestart,
    'message:status',
    (p) => p.clientMsgId === 'live-message-1' && p.status === 'SENT'
  );
  const liveIncoming = nextEvent(
    bobAgain,
    'message:new',
    (p) => p.message && p.message.clientMsgId === 'live-message-1'
  );
  aliceAfterRestart.send(JSON.stringify({
    type: 'message:send',
    payload: { conversationId, content: 'Live hello', clientMsgId: 'live-message-1' },
  }));
  expect((await liveSent).status).toBe('SENT');
  const incoming = await liveIncoming;
  expect(incoming.message.content).toBe('Live hello');

  const liveDelivery = nextEvent(
    aliceAfterRestart,
    'message:status',
    (p) => p.clientMsgId === 'live-message-1' && p.status === 'DELIVERED'
  );
  bobAgain.send(JSON.stringify({
    type: 'message:ack',
    payload: { messageId: incoming.message._id },
  }));
  await liveDelivery;
  expect(await Message.findById(incoming.message._id)).toMatchObject({ status: 'DELIVERED' });

  // Conversation authorization remains enforced on message history.
  const forbidden = await requestJson(
    `/api/conversations/${conversationId}/messages`,
    { token: loginC.data.token }
  );
  expect(forbidden.response.status).toBe(403);

  // History persists after an application restart and still uses its cursor API.
  await Message.insertMany(Array.from({ length: 52 }, (_, index) => ({
    conversation: conversationId,
    sender: registrationA.data.userId,
    content: `History page test message ${index + 1}`,
    status: 'SENT',
  })));
  await stopServer();
  await startServer();

  const historyPath = `/api/conversations/${conversationId}/messages?limit=50`;
  const history = await requestJson(historyPath, { token: loginB.data.token });
  expect(history.response.status).toBe(200);
  expect(history.data.messages).toHaveLength(50);
  expect(history.data.hasMore).toBe(true);
  expect(history.data.nextCursor).toBe(String(history.data.messages[0]._id));

  const olderHistory = await requestJson(
    `/api/conversations/${conversationId}/messages?limit=50&before=${history.data.nextCursor}`,
    { token: loginB.data.token }
  );
  expect(olderHistory.response.status).toBe(200);
  expect(olderHistory.data.messages).toHaveLength(4);
  expect(olderHistory.data.hasMore).toBe(false);
  expect(olderHistory.data.messages.map((message) => message.content)).toContain('Offline hello');
  const firstPageIds = new Set(history.data.messages.map((message) => String(message._id)));
  expect(olderHistory.data.messages.every((message) => !firstPageIds.has(String(message._id)))).toBe(true);


  // ?after returns newer messages in chronological order for reconnect/history sync.
  const afterCursor = String(olderHistory.data.messages[0]._id);
  const afterPage = await requestJson(
    `/api/conversations/${conversationId}/messages?after=${afterCursor}&limit=10`,
    { token: loginB.data.token }
  );
  expect(afterPage.response.status).toBe(200);
  expect(afterPage.data.messages).toHaveLength(10);
  expect(afterPage.data.hasMore).toBe(true);
  expect(String(afterPage.data.messages[0]._id) > afterCursor).toBe(true);
  expect(afterPage.data.nextCursor).toBe(String(afterPage.data.messages[9]._id));

  const afterPageTwo = await requestJson(
    `/api/conversations/${conversationId}/messages?after=${afterPage.data.nextCursor}&limit=10`,
    { token: loginB.data.token }
  );
  expect(afterPageTwo.response.status).toBe(200);
  const afterPageOneIds = new Set(afterPage.data.messages.map((message) => String(message._id)));
  expect(afterPageTwo.data.messages.every((message) => !afterPageOneIds.has(String(message._id)))).toBe(true);

  const conflictingCursors = await requestJson(
    `/api/conversations/${conversationId}/messages?before=${history.data.nextCursor}&after=${afterCursor}`,
    { token: loginB.data.token }
  );
  expect(conflictingCursors.response.status).toBe(400);
});
