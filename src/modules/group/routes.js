
const express = require('express');

const { currentUser } = require('../../middleware/currentUser');
const { createGroup } = require('./groupService');
const { publishGroupUpdate } = require('./groupEvents');

const router = express.Router();

router.use(currentUser);

// POST /api/groups
// Create a named group and notify every participant.
router.post('/', async (req, res, next) => {
  try {
    const { name, memberIds } = req.body || {};

    const conversation = await createGroup({
      creatorId: req.userId,
      name,
      memberIds,
    });

    const group = {
      conversationId: String(conversation._id),
      type: 'GROUP',
      name: conversation.name,
      participants: conversation.participants.map(String),
    };

    const payload = {
      action: 'ADDED',
      conversation: group,
    };

    // Notify the creator and all added members.
    group.participants.forEach((participantId) => {
      publishGroupUpdate(participantId, payload);
    });

    res.status(201).json({
      conversation: group,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
