const { AppError } = require('../../middleware/errorHandler');

// Use the authenticated identity and the current participants, never a client-supplied sender.
function assertConversationMember(conversation, userId) {
  if (!conversation) throw new AppError(404, 'NOT_FOUND', 'Conversation not found.');
  if (!userId || !Array.isArray(conversation.participants)
      || !conversation.participants.some((id) => String(id) === String(userId))) {
    throw new AppError(403, 'FORBIDDEN_NOT_MEMBER', 'You are not part of this conversation.');
  }
  return conversation;
}

module.exports = { assertConversationMember };
