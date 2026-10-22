const jwt = require('jsonwebtoken');
const config = require('../config');
const { AppError } = require('./errorHandler');

// The caller identity must come from a signed token, never from a request body
// or caller-controlled identity header.
function currentUser(req, _res, next) {
  try {
    const header = req.get('authorization') || '';
    if (!header.startsWith('Bearer ') || !config.jwtSecret) {
      throw new AppError(401, 'AUTH_FAILED', 'Authentication required.');
    }
    const decoded = jwt.verify(header.slice(7), config.jwtSecret);
    const userId = decoded.sub || decoded.userId || decoded.id;
    if (typeof userId !== 'string' || !userId) {
      throw new AppError(401, 'AUTH_FAILED', 'Authentication required.');
    }
    req.userId = userId;
    return next();
  } catch (error) {
    if (error instanceof AppError) return next(error);
    return next(new AppError(401, 'AUTH_FAILED', 'Authentication required.'));
  }
}

module.exports = { currentUser };
