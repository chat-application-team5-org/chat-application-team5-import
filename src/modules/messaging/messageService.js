const mongoose = require('mongoose');

const Conversation = require('../../models/Conversation');
const Message = require('../../models/Message');
const { AppError } = require('../../middleware/errorHandler');
const { validateMessageContent } = require('./validation');

// CA-27 / CA-30: persist first, then let the gateway acknowledge and broadcast.
async function sendMessage({ senderId, conversationId, content, clientMsgId }) {
  validateMessageContent(content);

  if (!mongoose.isValidObjectId(conversationId)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'A valid conversationId is required.');
  }

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) throw new AppError(404, 'NOT_FOUND', 'Conversation not found.');

  const isMember = conversation.participants.some((id) => String(id) === String(senderId));
  if (!isMember) throw new AppError(403, 'FORBIDDEN_NOT_MEMBER', 'You are not part of this conversation.');

  const recipientIds = conversation.participants
    .map(String)
    .filter((id) => id !== String(senderId));

  const message = await Message.create({
    conversation: conversation._id,
    sender: senderId,
    content,
    clientMsgId,
    recipientIds,
    deliveredTo: [],
  });

  await message.populate('sender', 'username');
  return { message, recipientIds };
}

// CA-24 / CA-30: return only messages not yet acknowledged by this recipient.
// The final two clauses preserve replay for messages written before CA-30.
async function loadPendingMessagesForRecipient({ recipientId }) {
  const conversations = await Conversation.find({ participants: recipientId }).select('_id');
  if (!conversations.length) return [];

  const conversationIds = conversations.map((conversation) => conversation._id);
  return Message.find({
    conversation: { $in: conversationIds },
    sender: { $ne: recipientId },
    status: 'SENT',
    $or: [
      {
        recipientIds: { $in: [recipientId] },
        deliveredTo: { $ne: recipientId },
      },
      {
        recipientIds: { $exists: false },
        deliveredTo: { $ne: recipientId },
      },
      {
        recipientIds: { $size: 0 },
        deliveredTo: { $ne: recipientId },
      },
    ],
  })
    .populate('sender', 'username')
    .sort({ createdAt: 1, _id: 1 });
}

// A recipient can acknowledge only their own pending delivery. A message is
// globally DELIVERED only when every intended recipient has acknowledged it.
async function markMessageDelivered({ recipientId, messageId }) {
  if (!mongoose.isValidObjectId(messageId)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'A valid messageId is required.');
  }

  const message = await Message.findById(messageId);
  if (!message) throw new AppError(404, 'NOT_FOUND', 'Message not found.');

  const conversation = await Conversation.findById(message.conversation);
  if (!conversation) throw new AppError(404, 'NOT_FOUND', 'Conversation not found.');

  const recipient = String(recipientId);
  const sender = String(message.sender);
  const isMember = conversation.participants.some((id) => String(id) === recipient);

  if (!isMember || sender === recipient) {
    throw new AppError(403, 'FORBIDDEN_NOT_RECIPIENT', 'Only a message recipient can acknowledge delivery.');
  }

  // Legacy messages have no stored recipient list. Infer it from the conversation.
  const storedRecipientIds = (message.recipientIds || []).map(String);
  const recipientIds = storedRecipientIds.length > 0
    ? storedRecipientIds
    : conversation.participants.map(String).filter((id) => id !== sender);

  if (!recipientIds.includes(recipient)) {
    throw new AppError(403, 'FORBIDDEN_NOT_RECIPIENT', 'This message was not addressed to this recipient.');
  }

  if (message.status !== 'SENT' || (message.deliveredTo || []).map(String).includes(recipient)) {
    return { message, newlyDelivered: false };
  }

  // $addToSet and the conditional filter make repeated acknowledgements idempotent.
  const acknowledgement = await Message.updateOne(
    { _id: message._id, deliveredTo: { $ne: recipientId } },
    { $addToSet: { deliveredTo: recipientId } }
  );

  const acknowledgementCount = acknowledgement.modifiedCount ?? acknowledgement.nModified ?? 0;
  if (acknowledgementCount === 0) {
    return { message, newlyDelivered: false };
  }

  const updatedMessage = await Message.findById(message._id);
  const deliveredIds = (updatedMessage.deliveredTo || []).map(String);
  const allRecipientsDelivered = recipientIds.every((id) => deliveredIds.includes(id));

  if (!allRecipientsDelivered) {
    return { message: updatedMessage, newlyDelivered: false };
  }

  const completion = await Message.updateOne(
    { _id: message._id, status: 'SENT' },
    { $set: { status: 'DELIVERED' } }
  );

  const newlyDelivered = (completion.modifiedCount ?? completion.nModified ?? 0) > 0;
  const finalMessage = newlyDelivered
    ? await Message.findById(message._id)
    : updatedMessage;

  return { message: finalMessage, newlyDelivered };
}

// CA-37: A recipient marks messages as read only after opening the conversation.
async function markMessagesRead({ readerId, conversationId, messageIds }) {
  if (!mongoose.isValidObjectId(conversationId) || !Array.isArray(messageIds) ||
      messageIds.length === 0 || messageIds.some((id) => !mongoose.isValidObjectId(id))) {
    throw new AppError(400, 'VALIDATION_ERROR', 'A valid conversationId and messageIds are required.');
  }

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) throw new AppError(404, 'NOT_FOUND', 'Conversation not found.');

  const reader = String(readerId);
  const isMember = conversation.participants.some((id) => String(id) === reader);
  if (!isMember) throw new AppError(403, 'FORBIDDEN_NOT_MEMBER', 'You are not part of this conversation.');

  const uniqueIds = [...new Set(messageIds.map(String))];
  const changed = await Message.updateMany(
    {
      _id: { $in: uniqueIds },
      conversation: conversation._id,
      sender: { $ne: readerId },
      status: { $in: ['SENT', 'DELIVERED'] },
    },
    { $set: { status: 'READ' }, $addToSet: { readBy: readerId } }
  );

  const messages = await Message.find({
    _id: { $in: uniqueIds },
    conversation: conversation._id,
    sender: { $ne: readerId },
    status: 'READ',
  }).select('_id sender clientMsgId status');

  return {
    messages,
    newlyRead: changed.modifiedCount ?? changed.nModified ?? 0,
  };
}

module.exports = {
  sendMessage,
  loadPendingMessagesForRecipient,
  markMessageDelivered,
  markMessagesRead,
};
