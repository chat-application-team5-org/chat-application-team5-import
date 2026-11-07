const express = require('express');
const request = require('supertest');
const logger = require('../src/utils/logger');
const { AppError, errorHandler } = require('../src/middleware/errorHandler');
const { requestId } = require('../src/middleware/requestId');

function appWithError(err) {
  const app = express();
  app.use(requestId);
  app.get('/', (_req, _res, next) => next(err));
  app.use(errorHandler);
  return app;
}

test('unexpected errors do not leak raw messages or codes into logs or responses', async () => {
  const log = jest.spyOn(logger, 'error').mockImplementation(() => {});
  try {
    const err = Object.assign(new Error('password secret-token'), { status: 400, code: 'secret-token' });
    const response = await request(appWithError(err)).get('/');
    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({ code: 'BAD_REQUEST', message: 'Request could not be processed.' });
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret-token');
    expect(response.headers['x-request-id']).toBe(response.body.error.requestId);
  } finally { log.mockRestore(); }
});

test('known application errors preserve their safe client message', async () => {
  const log = jest.spyOn(logger, 'error').mockImplementation(() => {});
  try {
    const response = await request(appWithError(new AppError(403, 'FORBIDDEN_NOT_MEMBER', 'Not a member.'))).get('/');
    expect(response.body.error).toMatchObject({ code: 'FORBIDDEN_NOT_MEMBER', message: 'Not a member.' });
  } finally { log.mockRestore(); }
});

test('malformed JSON does not echo a password', async () => {
  const log = jest.spyOn(logger, 'error').mockImplementation(() => {});
  try {
    const app = express();
    app.use(requestId);
    app.use(express.json());
    app.post('/', (_req, res) => res.sendStatus(204));
    app.use(errorHandler);
    const response = await request(app).post('/').set('Content-Type', 'application/json').send('secret-password');
    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({ code: 'VALIDATION_ERROR', message: 'Invalid JSON.' });
    expect(JSON.stringify(response.body)).not.toContain('secret-password');
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret-password');
  } finally { log.mockRestore(); }
});
