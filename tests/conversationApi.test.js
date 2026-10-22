process.env.JWT_SECRET = 'tests-only-chat-secret';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src/app');

// These checks stop before the database, so no MongoDB is needed.
describe('conversation API (CA-21)', () => {
  const app = createApp();
  const someId = '64b7f0c2a1b2c3d4e5f60718';
  const bearer = (id = someId) => `Bearer ${jwt.sign({ sub: id }, process.env.JWT_SECRET)}`;

  test('GET /api/conversations needs a caller identity', async () => {
    const res = await request(app).get('/api/conversations');
    expect(res.status).toBe(401);
  });

  test('caller-controlled x-user-id is not accepted as identity', async () => {
    const res = await request(app).get('/api/conversations').set('x-user-id', someId);
    expect(res.status).toBe(401);
  });

  test('POST /api/conversations rejects a missing participantId after authentication', async () => {
    const res = await request(app).post('/api/conversations').set('Authorization', bearer()).send({});
    expect(res.status).toBe(400);
  });

  test('GET /api/conversations/:id/messages rejects a bad id', async () => {
    const res = await request(app).get('/api/conversations/not-an-id/messages').set('Authorization', bearer());
    expect(res.status).toBe(400);
  });
});
