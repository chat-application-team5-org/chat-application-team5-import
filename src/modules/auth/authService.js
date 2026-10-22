const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const validator = require('validator');
const User = require('../../models/User');
const config = require('../../config');
const { AppError } = require('../../middleware/errorHandler');

const BCRYPT_COST = 10;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

function validateRegistration({ username, email, password }) {
  if (typeof username !== 'string' || username.trim().length < 3 || username.trim().length > 20) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Username must be 3 to 20 characters.');
  }
  if (typeof email !== 'string' || !validator.isEmail(email.trim())) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Enter a valid email address.');
  }
  if (typeof password !== 'string' || password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Password must be at least 8 characters and include a letter and a digit.');
  }
}

function isDuplicateKey(error) {
  return error && error.code === 11000;
}

async function registerUser(body) {
  validateRegistration(body || {});
  const username = body.username.trim().toLowerCase();
  const email = body.email.trim().toLowerCase();
  const existing = await User.findOne({ $or: [{ username }, { email }] });
  if (existing) throw new AppError(409, 'DUPLICATE_USER', 'Username or email already exists.');

  try {
    const passwordHash = await bcrypt.hash(body.password, BCRYPT_COST);
    const user = await User.create({ username, email, passwordHash });
    return { userId: String(user._id), username: user.username };
  } catch (error) {
    if (isDuplicateKey(error)) throw new AppError(409, 'DUPLICATE_USER', 'Username or email already exists.');
    throw error;
  }
}

async function loginUser(body) {
  if (!config.jwtSecret) throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Authentication is not configured.');
  const { identifier, password } = body || {};
  if (typeof identifier !== 'string' || typeof password !== 'string' || !identifier.trim() || !password) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Username/email and password are required.');
  }

  const normalized = identifier.trim().toLowerCase();
  const user = await User.findOne({ $or: [{ username: normalized }, { email: normalized }] });
  if (!user) throw new AppError(401, 'AUTH_INVALID_CREDENTIALS', 'Invalid credentials');

  if (user.lockUntil && user.lockUntil.getTime() > Date.now()) {
    throw new AppError(423, 'ACCOUNT_LOCKED', 'Account is locked. Try again later.');
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    if (user.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
      user.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
    }
    await user.save();
    throw new AppError(401, 'AUTH_INVALID_CREDENTIALS', 'Invalid credentials');
  }

  user.failedLoginAttempts = 0;
  user.lockUntil = null;
  await user.save();

  const issuedAt = Math.floor(Date.now() / 1000);
  const token = jwt.sign({ sub: String(user._id) }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
  const decoded = jwt.decode(token);
  return {
    token,
    expiresIn: decoded.exp - issuedAt,
    user: { userId: String(user._id), username: user.username, displayName: user.username },
  };
}

module.exports = { registerUser, loginUser };
