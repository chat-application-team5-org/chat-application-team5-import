const request = require('supertest');
const { createApp } = require('../src/app');

describe('GET /health', () => {
  it('returns status ok and the database state', async () => {
    const res = await request(createApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body).toHaveProperty('db');
  });
});

describe('unknown routes', () => {
  it('return the standard error format', async () => {
    const res = await request(createApp()).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
