
const mongoose = require('mongoose');
const logger = require('../utils/logger');

// Connects to MongoDB. Returns false when no URI is set
// or the database is unreachable, allowing /health to report its state.
async function connectDb(uri) {
  if (!uri) {
    logger.warn('database_uri_missing', {
      code: 'SERVICE_UNAVAILABLE',
      status: 503,
    });
    return false;
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });

    logger.info('database_connected');
    return true;
  } catch {
    // Do not log the raw error or connection details.
    logger.error('database_connection_failed', {
      code: 'SERVICE_UNAVAILABLE',
      status: 503,
    });
    return false;
  }
}

function dbState() {
  const states = [
    'disconnected',
    'connected',
    'connecting',
    'disconnecting',
  ];

  return states[mongoose.connection.readyState] || 'unknown';
}

module.exports = { connectDb, dbState };
