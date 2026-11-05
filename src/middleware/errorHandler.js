
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
  } else {
    status =
      Number.isInteger(err.status) && err.status >= 400 && err.status <= 599
        ? err.status
        : 500;

    code =
      typeof err.code === 'string' && err.code
        ? err.code
        : 'INTERNAL_ERROR';

    message =
      status >= 500
        ? 'Something went wrong, please try again'
        : err.message;
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

