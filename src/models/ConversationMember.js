const mongoose = require('mongoose');

const conversationMemberSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    role: { type: String, enum: ['ADMIN', 'MEMBER'] },
    joinedAt: { type: Date, default: Date.now },
    lastReadMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
  },
  { timestamps: true }
);

conversationMemberSchema.index({ conversation: 1, user: 1 }, { unique: true });
conversationMemberSchema.index({ user: 1 });

module.exports = mongoose.model('ConversationMember', conversationMemberSchema);
