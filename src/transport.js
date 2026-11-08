const fs = require('fs');
const http = require('http');
const https = require('https');

function createTransport(app, config) {
  const { tlsKeyPath, tlsCertPath, environment, jwtSecret, allowedOrigin } = config;
  if (Boolean(tlsKeyPath) !== Boolean(tlsCertPath)) {
    throw new Error('Both TLS key and certificate paths are required.');
  }
  if (environment === 'production') {
    if (!tlsKeyPath || !tlsCertPath) throw new Error('Production requires TLS certificate and key paths.');
    if (typeof jwtSecret !== 'string' || jwtSecret.length < 32 || jwtSecret === 'change-me-to-a-long-random-string') {
      throw new Error('Production requires a strong JWT secret.');
    }
    let origin;
    try { origin = new URL(allowedOrigin); } catch { throw new Error('Production requires an HTTPS allowed origin.'); }
    if (origin.protocol !== 'https:' || origin.origin !== allowedOrigin) throw new Error('Production requires an HTTPS allowed origin.');
  }
  if (!tlsKeyPath) return http.createServer(app);
  return https.createServer({
    key: fs.readFileSync(tlsKeyPath), cert: fs.readFileSync(tlsCertPath), minVersion: 'TLSv1.2',
  }, app);
}

module.exports = { createTransport };
