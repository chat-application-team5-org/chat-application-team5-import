require('dotenv').config();

// Central place for configuration. Secrets come from environment variables only.
module.exports = {
  port: Number(process.env.PORT) || 3000,
  mongoUri: process.env.MONGO_URI || '',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  allowedOrigin: process.env.ALLOWED_ORIGIN || 'http://localhost:3000',
  environment: process.env.NODE_ENV || 'development',
  tlsKeyPath: process.env.TLS_KEY_PATH || '',
  tlsCertPath: process.env.TLS_CERT_PATH || '',
};
