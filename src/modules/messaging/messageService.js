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

// CA-24: load durable messages for this authenticated recipient that have not
// been acknowledged by the receiving client. The API history remains the
// source of truth if a connection drops while a message is being replayed.
async function loadPendingMessagesForRecipient({ recipientId }) {
  const conversations = await Conversation.find({ participants: recipientId }).select('_id');
  if (!conversations.length) return [];

  const conversationIds = conversations.map((conversation) => conversation._id);
  return Message.find({
    conversation: { $in: conversationIds },
    sender: { $ne: recipientId },
    status: 'SENT',
  })
    .populate('sender', 'username')
    .sort({ createdAt: 1, _id: 1 });
}

// A delivery acknowledgement is accepted only from a conversation member
// other than the sender. The conditional update makes repeated acknowledgements
// idempotent and stops reconnects from replaying already-acknowledged messages.
async function markMessageDelivered({ recipientId, messageId }) {
  if (!mongoose.isValidObjectId(messageId)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'A valid messageId is required.');
  }

  const message = await Message.findById(messageId);
  if (!message) throw new AppError(404, 'NOT_FOUND', 'Message not found.');

  const conversation = await Conversation.findById(message.conversation);
  if (!conversation) throw new AppError(404, 'NOT_FOUND', 'Conversation not found.');

  const isMember = conversation.participants.some((id) => String(id) === String(recipientId));
  if (!isMember || String(message.sender) === String(recipientId)) {
    throw new AppError(403, 'FORBIDDEN_NOT_RECIPIENT', 'Only a message recipient can acknowledge delivery.');
  }

  if (message.status !== 'SENT') return { message, newlyDelivered: false };

  const result = await Message.updateOne(
    { _id: message._id, status: 'SENT' },
    { $set: { status: 'DELIVERED' } }
  );
  const modifiedCount = result.modifiedCount ?? result.nModified ?? 0;
  return { message, newlyDelivered: modifiedCount > 0 };
}

module.exports = { sendMessage, loadPendingMessagesForRecipient, markMessageDelivered };
