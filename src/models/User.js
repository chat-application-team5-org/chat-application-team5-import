const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    failedLoginAttempts: { type: Number, default: 0, min: 0 },
    lockUntil: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('User', userSchema);
