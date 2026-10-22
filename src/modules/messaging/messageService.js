const mongoose = require('mongoose');
const Conversation = require('../../models/Conversation');
const Message = require('../../models/Message');
const { AppError } = require('../../middleware/errorHandler');
const { validateMessageContent } = require('./validation');

// CA-27: validate, check membership, SAVE, and only then return.
// The caller sends the acknowledgement after this promise resolves.
async function sendMessage({ senderId, conversationId, content, clientMsgId }) {
  validateMessageContent(content);
  if (!mongoose.isValidObjectId(conversationId)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'A valid conversationId is required.');
  }

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) throw new AppError(404, 'NOT_FOUND', 'Conversation not found.');

  const isMember = conversation.participants.some((id) => String(id) === String(senderId));
  if (!isMember) throw new AppError(403, 'FORBIDDEN_NOT_MEMBER', 'You are not part of this conversation.');

  const message = await Message.create({
    conversation: conversation._id,
    sender: senderId,
    content,
    clientMsgId,
  });
  await message.populate('sender', 'username');

  const recipientIds = conversation.participants
    .map(String)
    .filter((id) => id !== String(senderId));

  return { message, recipientIds };
}

module.exports = { sendMessage };
