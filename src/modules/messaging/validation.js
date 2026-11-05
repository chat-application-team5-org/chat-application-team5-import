const validator = require('validator');
const { AppError } = require('../../middleware/errorHandler');

const MAX_MESSAGE_LENGTH = 2000;

// Returns the message text if valid, otherwise throws an AppError (CA-23).
function validateMessageContent(content) {
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Message cannot be empty.');
  }
  if (content.length > MAX_MESSAGE_LENGTH) {
    throw new AppError(400, 'MESSAGE_TOO_LONG', `Message cannot exceed ${MAX_MESSAGE_LENGTH} characters.`);
  }
  return content;
}

// Validate the original text before escaping so entity expansion does not change the limit.
function sanitizeMessageContent(content) {
  return validator.escape(validateMessageContent(content));
}

module.exports = { validateMessageContent, sanitizeMessageContent, MAX_MESSAGE_LENGTH };
