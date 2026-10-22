const express = require('express');
const User = require('../../models/User');
const { currentUser } = require('../../middleware/currentUser');
const { AppError } = require('../../middleware/errorHandler');

const router = express.Router();
const MAX_RESULTS = 10;
const MAX_QUERY_LENGTH = 20;

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
    })
      .select('_id username')
      .sort({ username: 1 })
      .limit(MAX_RESULTS);

    return res.status(200).json(users.map((user) => ({
      userId: String(user._id),
      username: user.username,
      displayName: user.username,
    })));
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
