const path = require('path');
const express = require('express');
const { dbState } = require('./db/connect');
const { notFound, errorHandler } = require('./middleware/errorHandler');

// Builds the Express app. Kept separate from server.js so tests can import it.
function createApp() {
  const app = express();
  app.use(express.json({ limit: '10kb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), db: dbState() });
  });

  app.use('/api/auth', require('./modules/auth/routes'));

  // Conversations (CA-21)
  app.use('/api/conversations', require('./modules/messaging/routes'));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
