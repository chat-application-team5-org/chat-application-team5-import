const express = require('express');
const mongoose = require('mongoose');
const Conversation = require('../../models/Conversation');
const Message = require('../../models/Message');
const { getOrCreatePrivateConversation } = require('./conversationService');
const { currentUser } = require('../../middleware/currentUser');
const { AppError } = require('../../middleware/errorHandler');

const router = express.Router();
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

// Authenticate every conversation operation before looking at user IDs.
router.use(currentUser);

// Newest messages first from the database, returned oldest to newest for display.
async function loadRecentMessages(conversationId, limit = DEFAULT_LIMIT) {
  const messages = await Message.find({ conversation: conversationId })
    .populate('sender', 'username')
    .sort({ _id: -1 })
    .limit(limit);
  return messages.reverse();
}

// Legacy path retained for client compatibility. The caller always comes from
// the verified token; a userId in the request body is ignored.
router.post('/private', async (req, res, next) => {
  try {
    const { otherUserId } = req.body || {};
    if (!mongoose.isValidObjectId(otherUserId)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'A valid otherUserId is required.');
    }
    const conversation = await getOrCreatePrivateConversation(req.userId, otherUserId);
    res.status(200).json({ conversation });
  } catch (error) {
    next(error);
  }
});

// POST /api/conversations {participantId}: create the private chat the first
// time, return the same one afterwards, and include the recent messages.
router.post('/', async (req, res, next) => {
  try {
    const { participantId } = req.body || {};
    if (!mongoose.isValidObjectId(participantId)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'A valid participantId is required.');
    }
    const conversation = await getOrCreatePrivateConversation(req.userId, participantId);
    const messages = await loadRecentMessages(conversation._id);
    res.status(200).json({ conversation, messages });
  } catch (error) {
    next(error);
  }
});

// GET /api/conversations: only the caller's own conversations.
router.get('/', async (req, res, next) => {
  try {
    const records = await Conversation.find({ participants: req.userId })
      .populate('participants', 'username')
      .sort({ updatedAt: -1 });
    const conversations = records.map((conversation) => {
      const otherParticipant = conversation.participants.find((participant) => String(participant._id) !== req.userId);
      return {
        conversationId: String(conversation._id),
        type: conversation.type === 'group' ? 'GROUP' : 'PRIVATE',
        name: otherParticipant ? otherParticipant.username : 'Private conversation',
        lastMessage: '',
        unreadCount: 0,
      };
    });
    res.status(200).json(conversations);
  } catch (error) {
    next(error);
  }
});

// GET /api/conversations/:id/messages?limit=50&before=<messageId>
// Returns one page in oldest-to-newest display order. The opaque cursor is the
// oldest message ID in the current page. Generated ObjectIds give a stable
// descending cursor consistent with the query sort.
router.get('/:id/messages', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'A valid conversation id is required.');
    }
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) throw new AppError(404, 'NOT_FOUND', 'Conversation not found.');

    const isMember = conversation.participants.some((id) => String(id) === req.userId);
    if (!isMember) throw new AppError(403, 'FORBIDDEN_NOT_MEMBER', 'You are not part of this conversation.');

    const requested = Number.parseInt(req.query.limit, 10);
    const limit = Math.min(Number.isNaN(requested) || requested < 1 ? DEFAULT_LIMIT : requested, MAX_LIMIT);
    const hasBefore = req.query.before !== undefined;
    const hasAfter = req.query.after !== undefined;
    if (hasBefore && hasAfter) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Use either before or after, not both.');
    }

    const query = { conversation: conversation._id };
    let sort = { _id: -1 };
    const ascending = hasAfter;
    if (hasBefore) {
      if (!mongoose.isValidObjectId(req.query.before)) {
        throw new AppError(400, 'VALIDATION_ERROR', 'A valid before cursor is required.');
      }
      query._id = { $lt: new mongoose.Types.ObjectId(req.query.before) };
    } else if (hasAfter) {
      if (!mongoose.isValidObjectId(req.query.after)) {
        throw new AppError(400, 'VALIDATION_ERROR', 'A valid after cursor is required.');
      }
      query._id = { $gt: new mongoose.Types.ObjectId(req.query.after) };
      sort = { _id: 1 };
    }

    const rows = await Message.find(query)
      .populate('sender', 'username')
      .sort(sort)
      .limit(limit + 1);
    const hasMore = rows.length > limit;
    const selected = rows.slice(0, limit);
    const page = ascending ? selected : selected.reverse();
    res.status(200).json({
      messages: page,
      hasMore,
      // For "before", continue from the oldest returned item; for "after",
      // continue from the newest returned item.
      nextCursor: hasMore && page.length
        ? String(ascending ? page[page.length - 1]._id : page[0]._id)
        : null,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
