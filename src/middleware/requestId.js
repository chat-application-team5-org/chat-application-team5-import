
const { createRequestId } = require('../utils/logger');

function requestId(req, res, next) {
  req.requestId = createRequestId();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}

module.exports = { requestId };
