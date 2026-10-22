const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
      validate: {
        validator: (value) => value.trim().length > 0,
        message: 'Message content cannot be blank.',
      },
    },
    status: { type: String, enum: ['SENT', 'DELIVERED', 'READ'], default: 'SENT' },
    clientMsgId: { type: String },
  },
  { timestamps: true }
);

messageSchema.index({ conversation: 1, createdAt: 1 });
messageSchema.index({ conversation: 1, _id: -1 });

module.exports = mongoose.model('Message', messageSchema);
