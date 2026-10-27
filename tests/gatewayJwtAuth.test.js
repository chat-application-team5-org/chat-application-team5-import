const http = require('http');
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const config = require('../src/config');
const { attachGateway } = require('../src/ws/gateway');

const ALLOWED_ORIGIN = 'http://localhost:3000';
const JWT_SECRET = 'ca-19-test-secret';

let server;
let wss;
let port;
let previousJwtSecret;

beforeAll((done) => {
  previousJwtSecret = config.jwtSecret;
  config.jwtSecret = JWT_SECRET;
  server = http.createServer();
  wss = attachGateway(server, { allowedOrigin: ALLOWED_ORIGIN, authTimeoutMs: 500 });
  server.listen(0, () => {
    port = server.address().port;
    done();
  });
});

afterAll((done) => {
  wss.clients.forEach((socket) => socket.terminate());
  wss.close(() => server.close(() => {
    config.jwtSecret = previousJwtSecret;
    done();
  }));
});

function connect() {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://localhost:${port}/ws`, { origin: ALLOWED_ORIGIN });
    socket.inbox = [];
    socket.closed = new Promise((resolveClose) => {
      socket.once('close', (code) => resolveClose(code));
    });
    socket.on('message', (raw) => socket.inbox.push(JSON.parse(raw.toString())));
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

async function waitFor(socket, type) {
  for (let i = 0; i < 100; i += 1) {
    const message = socket.inbox.find((item) => item.type === type);
    if (message) return message;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for WebSocket event ${type}`);
}

describe('WebSocket JWT authentication (CA-19)', () => {
  it('authenticates a valid JWT and returns auth:ok', async () => {
    const token = jwt.sign({ sub: 'user-123' }, JWT_SECRET, { expiresIn: '1h' });
    const socket = await connect();
    socket.send(JSON.stringify({ type: 'auth', payload: { token } }));

    const authenticated = await waitFor(socket, 'auth:ok');
    expect(authenticated.payload.userId).toBe('user-123');
    socket.close();
  });

  it('rejects an invalid JWT with AUTH_FAILED and close code 4401', async () => {
    const socket = await connect();
    socket.send(JSON.stringify({ type: 'auth', payload: { token: 'not-a-jwt' } }));

    const error = await waitFor(socket, 'error');
    expect(error.payload.code).toBe('AUTH_FAILED');
    expect(await socket.closed).toBe(4401);
  });

  it('rejects an expired JWT with AUTH_FAILED and close code 4401', async () => {
    const token = jwt.sign({ sub: 'user-123' }, JWT_SECRET, { expiresIn: -1 });
    const socket = await connect();
    socket.send(JSON.stringify({ type: 'auth', payload: { token } }));

    const error = await waitFor(socket, 'error');
    expect(error.payload.code).toBe('AUTH_FAILED');
    expect(await socket.closed).toBe(4401);
  });

  it('rejects a missing JWT with AUTH_FAILED and close code 4401', async () => {
    const socket = await connect();
    socket.send(JSON.stringify({ type: 'auth', payload: {} }));

    const error = await waitFor(socket, 'error');
    expect(error.payload.code).toBe('AUTH_FAILED');
    expect(await socket.closed).toBe(4401);
  });
});
