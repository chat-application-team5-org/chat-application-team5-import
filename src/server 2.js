const http = require('http');
const config = require('./config');
const { createApp } = require('./app');
const { connectDb } = require('./db/connect');
const { attachGateway } = require('./ws/gateway');

async function main() {
  await connectDb(config.mongoUri);

  const app = createApp();
  const server = http.createServer(app);
  attachGateway(server, { allowedOrigin: config.allowedOrigin });

  server.listen(config.port, () => {
    console.log(`Chat server listening on http://localhost:${config.port} (WebSocket path /ws)`);
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
