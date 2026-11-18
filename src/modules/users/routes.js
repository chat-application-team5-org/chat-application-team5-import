const express = require('express');
const bcrypt = require('bcrypt');
const User = require('../../models/User');
const { currentUser } = require('../../middleware/currentUser');
const { AppError } = require('../../middleware/errorHandler');
const { isOnline, getLastSeen } = require('../presence/presenceService');

const router = express.Router();
const MAX_RESULTS = 10;
const MAX_QUERY_LENGTH = 20;
const BCRYPT_COST = 10;

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function publicProfile(user) {
  return {
    userId: String(user._id),
    username: user.username,
    displayName: user.displayName || user.username,
    statusMessage: user.statusMessage || '',
  };
}

// Profile endpoints must be declared before /:id-style routes.
router.get('/me', currentUser, async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).select('_id username email displayName statusMessage');
    if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found.');
    res.status(200).json({ profile: publicProfile(user) });
  } catch (error) {
    next(error);
  }
});

router.patch('/me', currentUser, async (req, res, next) => {
  try {
    const body = req.body || {};
    const allowed = ['displayName', 'statusMessage'];
    if (!Object.keys(body).length || Object.keys(body).some((key) => !allowed.includes(key))) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Provide displayName and/or statusMessage only.');
    }
    const updates = {};
    if (Object.prototype.hasOwnProperty.call(body, 'displayName')) {
      if (typeof body.displayName !== 'string' || body.displayName.trim().length > 40) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Display name must be 40 characters or fewer.');
      }
      updates.displayName = body.displayName.trim();
    }
    if (Object.prototype.hasOwnProperty.call(body, 'statusMessage')) {
      if (typeof body.statusMessage !== 'string' || body.statusMessage.trim().length > 100) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Status message must be 100 characters or fewer.');
      }
      updates.statusMessage = body.statusMessage.trim();
    }
    const user = await User.findByIdAndUpdate(req.userId, { $set: updates }, { new: true, runValidators: true })
      .select('_id username displayName statusMessage');
    if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found.');
    res.status(200).json({ profile: publicProfile(user) });
  } catch (error) {
    next(error);
  }
});

router.put('/me/password', currentUser, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || !currentPassword
      || typeof newPassword !== 'string' || newPassword.length < 8
      || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'New password must be at least 8 characters and include a letter and a digit.');
    }
    const user = await User.findById(req.userId);
    if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found.');
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new AppError(401, 'AUTH_INVALID_CREDENTIALS', 'Current password is incorrect.');
    }
    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'New password must be different from the current password.');
    }
    user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    await user.save();
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.get('/search', currentUser, async (req, res, next) => {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!query) return res.status(200).json([]);
    if (query.length > MAX_QUERY_LENGTH) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Search query must be 20 characters or fewer.');
    }
    const users = await User.find({
      _id: { $ne: req.userId },
      username: { $regex: escapeRegex(query), $options: 'i' },
    }).select('_id username displayName statusMessage lastSeen').sort({ username: 1 }).limit(MAX_RESULTS);

    return res.status(200).json(users.map((user) => {
      const userId = String(user._id);
      const lastSeen = user.lastSeen || getLastSeen(userId);
      return {
        userId,
        username: user.username,
        displayName: user.displayName || user.username,
        statusMessage: user.statusMessage || '',
        status: isOnline(userId) ? 'online' : 'offline',
        lastSeen: lastSeen ? lastSeen.toISOString() : null,
      };
    }));
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
