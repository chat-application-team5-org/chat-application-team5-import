
const http = require('http');
const config = require('./config');
const { createApp } = require('./app');
const { connectDb } = require('./db/connect');
const { attachGateway } = require('./ws/gateway');
const logger = require('./utils/logger');

async function main() {
  await connectDb(config.mongoUri);

  const app = createApp();
  const server = http.createServer(app);
  attachGateway(server, { allowedOrigin: config.allowedOrigin });

  server.listen(config.port, () => {
    logger.info('server_listening', {
      status: server.listening ? 'listening' : 'not_listening',
    });
  });
}

main().catch(() => {
  logger.error('server_startup_failed', {
    code: 'INTERNAL_ERROR',
    status: 500,
  });
  process.exit(1);
});
