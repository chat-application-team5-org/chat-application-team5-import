const express = require('express');
const { registerUser, loginUser } = require('./authService');
const { currentUser } = require('../../middleware/currentUser');

const router = express.Router();

router.post('/register', async (req, res, next) => {
  try {
    const user = await registerUser(req.body);
    return res.status(201).json(user);
  } catch (error) {
    return next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const login = await loginUser(req.body);
    return res.status(200).json(login);
  } catch (error) {
    return next(error);
  }
});

// The browser clears its token and closes its own WebSocket after this response.
router.post('/logout', currentUser, (_req, res) => res.status(204).end());

module.exports = router;
