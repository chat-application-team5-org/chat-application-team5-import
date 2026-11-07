
const crypto = require('crypto');

function log(level, event, details = {}) {
  // Only allow safe, explicitly selected fields into the log.
  const entry = {
    level,
    timestamp: new Date().toISOString(),
    requestId: details.requestId || null,
    userId: details.userId || null,
    event,
  };

  if (details.code) {
    entry.code = details.code;
  }

  if (details.status) {
    entry.status = details.status;
  }

  // Never pass passwords, tokens, message content, request bodies,
  // raw errors, or stack traces to this logger.
  process.stdout.write(`${JSON.stringify(entry)}\n`);
}

function createRequestId() {
  return crypto.randomUUID();
}

module.exports = {
  debug: (event, details) => log('debug', event, details),
  info: (event, details) => log('info', event, details),
  warn: (event, details) => log('warn', event, details),
  error: (event, details) => log('error', event, details),
  createRequestId,
};
