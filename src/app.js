
const path = require('path');
const express = require('express');
const { dbState } = require('./db/connect');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { requestId } = require('./middleware/requestId');

function createApp() {
  const app = express();

  // Assign an ID before processing each request.
  app.use(requestId);

  app.use(express.json({ limit: '10kb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/health', (_req, res) => {
    const db = dbState();
    const healthy = db === 'connected';

    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'unavailable',
      uptime: process.uptime(),
      db,
    });
  });

  app.use('/api/auth', require('./modules/auth/routes'));
  app.use('/api/users', require('./modules/users/routes'));
  app.use('/api/conversations', require('./modules/messaging/routes'));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
