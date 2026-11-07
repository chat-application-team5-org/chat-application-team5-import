
const logger = require('../utils/logger');

class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

function isDatabaseUnavailable(err) {
  const databaseErrorNames = [
    'MongooseServerSelectionError',
    'MongoNetworkError',
    'MongoNetworkTimeoutError',
    'MongoNotConnectedError',
  ];

  return databaseErrorNames.includes(err?.name);
}

function notFound(_req, _res, next) {
  next(new AppError(404, 'NOT_FOUND', 'Not found'));
}

function errorHandler(err, req, res, _next) {
  let status;
  let code;
  let message;

  if (isDatabaseUnavailable(err)) {
    status = 503;
    code = 'SERVICE_UNAVAILABLE';
    message = 'Service temporarily unavailable, please try again';
  } else if (err instanceof AppError && Number.isInteger(err.status) && err.status >= 400 && err.status <= 499) {
    status = err.status;
    code = err.code;
    message = err.message;
  } else if (err?.type === 'entity.parse.failed') {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = 'Invalid JSON.';
  } else if (err?.type === 'entity.too.large') {
    status = 413;
    code = 'VALIDATION_ERROR';
    message = 'Request body is too large.';
  } else {
    // Third-party error messages and codes can contain request data or secrets.
    status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 500 ? err.status : 500;
    code = status < 500 ? 'BAD_REQUEST' : 'INTERNAL_ERROR';
    message = status < 500 ? 'Request could not be processed.' : 'Something went wrong, please try again';
  }

  const requestId = req.requestId || null;
  const userId = req.userId || null;

  logger.error('request_failed', {
    requestId,
    userId,
    code,
    status,
  });

  res.status(status).json({
    error: {
      code,
      message,
      requestId,
    },
  });
}

module.exports = {
  AppError,
  notFound,
  errorHandler,
  isDatabaseUnavailable,
};
