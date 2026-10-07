// Standard error format (SAD 4.4): { error: { code, message } }
class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function notFound(_req, _res, next) {
  next(new AppError(404, 'NOT_FOUND', 'Not found'));
}

function errorHandler(err, _req, res, _next) {
  const status = err.status || 500;
  const code = err.code || 'INTERNAL_ERROR';
  if (status >= 500) console.error(err); // never send stack traces to clients
  const message = status >= 500 ? 'Something went wrong, please try again' : err.message;
  res.status(status).json({ error: { code, message } });
}

module.exports = { AppError, notFound, errorHandler };
