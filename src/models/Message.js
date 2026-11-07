const mongoose = require('mongoose');
const validator = require('validator');

const messageSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: {
      type: String,
      required: true,
      trim: true,
      // Escaped text can expand to six characters per input character.
      maxlength: 12000,
      validate: [
        { validator: (value) => value.trim().length > 0, message: 'Message content cannot be blank.' },
        {
          validator: function (value) {
            const text = this.contentEncoding === 'html-escaped-v1' ? validator.unescape(value) : value;
            return text.length <= 2000;
          },
          message: 'Message content cannot exceed 2000 characters.',
        },
      ],
    },
    // Missing on legacy messages, which are already plain text.
    contentEncoding: { type: String, enum: ['html-escaped-v1'] },
    // CA-30: Track delivery independently for every intended recipient.
    recipientIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      default: [],
    },
    // CA-37: recipients who have opened and read this message.
    readBy: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      default: [],
    },
    deliveredTo: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      default: [],
    },
    status: { type: String, enum: ['SENT', 'DELIVERED', 'READ'], default: 'SENT' },
    clientMsgId: { type: String },
  },
  { timestamps: true }
);

messageSchema.index({ conversation: 1, createdAt: 1 });
messageSchema.index({ conversation: 1, _id: -1 });
// CA-24: efficiently find messages that still need delivery to a recipient.
messageSchema.index({ conversation: 1, status: 1, createdAt: 1 });

module.exports = mongoose.model('Message', messageSchema);
