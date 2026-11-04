const mongoose = require('mongoose');

const memberRoleSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    role: {
      type: String,
      enum: ['ADMIN', 'MEMBER'],
      required: true,
    },
  },
  { _id: false }
);

const conversationSchema = new mongoose.Schema(
  {
    participants: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      required: true,
      validate: {
        validator(participants) {
          const unique = new Set(participants.map(String)).size
            === participants.length;

          if (!unique) return false;

          if (this.type === 'private') {
            return participants.length === 2;
          }

          return participants.length >= 3;
        },
        message: 'A conversation has an invalid participant list.',
      },
    },

    type: {
      type: String,
      enum: ['private', 'group'],
      default: 'private',
      required: true,
    },

    // Group-specific metadata.
    name: {
      type: String,
      trim: true,
      minlength: 3,
      maxlength: 50,
      required() {
        return this.type === 'group';
      },
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required() {
        return this.type === 'group';
      },
    },

    memberRoles: {
      type: [memberRoleSchema],
      default: [],
      validate: {
        validator(members) {
          if (this.type !== 'group') return true;

          if (!this.participants || members.length !== this.participants.length) {
            return false;
          }

          const memberIds = members.map((member) => String(member.user));
          const participantIds = this.participants.map(String);

          const unique = new Set(memberIds).size === memberIds.length;
          const allParticipantsIncluded = participantIds.every(
            (id) => memberIds.includes(id)
          );

          const admins = members.filter(
            (member) => member.role === 'ADMIN'
          );

          return (
            unique &&
            allParticipantsIncluded &&
            admins.length === 1 &&
            String(admins[0].user) === String(this.createdBy)
          );
        },
        message: 'Every group member must have one role and the creator must be the ADMIN.',
      },
    },

    // Sorted "idA_idB" key prevents duplicate private conversations.
    participantsKey: {
      type: String,
    },
  },
  { timestamps: true }
);

function buildParticipantsKey(ids) {
  return ids.map(String).sort().join('_');
}

conversationSchema.pre('validate', function setKey() {
  if (this.type === 'private' && this.participants.length === 2) {
    this.participantsKey = buildParticipantsKey(this.participants);
  }
});

conversationSchema.index({ participantsKey: 1 }, {
  unique: true,
  sparse: true,
});

conversationSchema.index({ participants: 1 });

const Conversation = mongoose.model('Conversation', conversationSchema);

Conversation.buildParticipantsKey = buildParticipantsKey;

module.exports = Conversation;