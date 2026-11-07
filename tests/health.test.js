
jest.mock('../src/db/connect', () => ({
  dbState: jest.fn(),
}));

const request = require('supertest');
const { dbState } = require('../src/db/connect');
const { createApp } = require('../src/app');

describe('GET /health', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 when the database is connected', async () => {
    dbState.mockReturnValue('connected');

    const res = await request(createApp()).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('connected');
    expect(res.body.uptime).toEqual(expect.any(Number));
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('returns 503 when the database is disconnected', async () => {
    dbState.mockReturnValue('disconnected');

    const res = await request(createApp()).get('/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('unavailable');
    expect(res.body.db).toBe('disconnected');
    expect(res.body.uptime).toEqual(expect.any(Number));
  });
});

describe('unknown routes', () => {
  it('return the standard error format', async () => {
    const res = await request(createApp()).get('/nope');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.requestId).toBeDefined();
    expect(res.headers['x-request-id']).toBe(res.body.error.requestId);
  });
});
