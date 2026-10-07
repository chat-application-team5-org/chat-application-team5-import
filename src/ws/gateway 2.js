const { WebSocketServer } = require('ws');

const PING_INTERVAL_MS = 30000; // REQ-21
const MAX_PAYLOAD_BYTES = 4096; // SRS 3.3 (4 KB frame limit)

// WebSocket gateway skeleton. Real behaviour is built in later stories:
//   CA-19  Origin check, auth event within 5 s, close 4401 on failure (REQ-6)
//   CA-22  message:send / message:new routing (REQ-9)
//   CA-35  ping/pong heartbeat, offline within 40 s (REQ-21)
function attachGateway(server, { allowedOrigin }) {
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: MAX_PAYLOAD_BYTES,
    verifyClient: ({ origin }) => !origin || origin === allowedOrigin, // SEC-6 (basic)
  });

  wss.on('connection', (socket) => {
    socket.isAlive = true;
    socket.on('pong', () => { socket.isAlive = true; });

    socket.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return socket.send(JSON.stringify({ type: 'error', payload: { code: 'VALIDATION_ERROR', message: 'Invalid JSON' } }));
      }
      // TODO: dispatch msg.type (auth, message:send, typing, ...) to modules
      socket.send(JSON.stringify({ type: 'error', payload: { code: 'VALIDATION_ERROR', message: `Unsupported event: ${msg.type}` } }));
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
