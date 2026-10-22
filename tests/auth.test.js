process.env.JWT_SECRET = 'tests-only-chat-secret';

const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
jest.mock('../src/models/User', () => ({
  findOne: jest.fn(),
  create: jest.fn(),
}));
const User = require('../src/models/User');
const { createApp } = require('../src/app');

describe('authentication API (CA-11, CA-16, CA-17, CA-18, CA-20)', () => {
  const app = createApp();
  const userId = '64b7f0c2a1b2c3d4e5f60718';
  let user;

  beforeEach(async () => {
    jest.clearAllMocks();
    user = {
      _id: userId,
      username: 'alice',
      email: 'alice@example.com',
      passwordHash: await bcrypt.hash('Secret123', 10),
      failedLoginAttempts: 0,
      lockUntil: null,
      save: jest.fn().mockResolvedValue(undefined),
    };
  });

  test('registration validates fields and stores a salted bcrypt hash', async () => {
    User.findOne.mockResolvedValue(null);
    User.create.mockImplementation(async (data) => ({ _id: userId, username: data.username }));

    const response = await request(app).post('/api/auth/register').send({
      username: 'Alice', email: 'Alice@Example.com', password: 'Secret123',
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ userId, username: 'alice' });
    const [created] = User.create.mock.calls[0];
    const hash = created.passwordHash;
    expect(hash).toMatch(/^\$2[aby]\$10\$/);
    expect(await bcrypt.compare('Secret123', hash)).toBe(true);
    expect(hash).not.toBe('Secret123');
  });

  test.each([
    [{ username: 'ab', email: 'alice@example.com', password: 'Secret123' }],
    [{ username: 'alice', email: 'not-an-email', password: 'Secret123' }],
    [{ username: 'alice', email: 'alice@example.com', password: 'weakpass' }],
    [{ username: 'alice', email: 'alice@example.com', password: '12345678' }],
  ])('registration rejects invalid values', async (body) => {
    const response = await request(app).post('/api/auth/register').send(body);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(User.create).not.toHaveBeenCalled();
  });

  test('registration rejects an existing account', async () => {
    User.findOne.mockResolvedValue(user);
    const response = await request(app).post('/api/auth/register').send({
      username: 'Alice', email: 'alice@example.com', password: 'Secret123',
    });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('DUPLICATE_USER');
    expect(User.create).not.toHaveBeenCalled();
  });

  test.each(['alice', 'ALICE@EXAMPLE.COM'])('login accepts username or email and returns a 24-hour JWT', async (identifier) => {
    User.findOne.mockResolvedValue(user);
    const response = await request(app).post('/api/auth/login').send({ identifier, password: 'Secret123' });

    expect(response.status).toBe(200);
    expect(response.body.expiresIn).toBe(86400);
    expect(response.body.user).toEqual({ userId, username: 'alice', displayName: 'alice' });
    expect(jwt.verify(response.body.token, process.env.JWT_SECRET).sub).toBe(userId);
    expect(user.failedLoginAttempts).toBe(0);
    expect(user.lockUntil).toBeNull();
  });

  test('failed login uses a generic error and locks after five consecutive failures', async () => {
    User.findOne.mockResolvedValue(user);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(app).post('/api/auth/login').send({ identifier: 'alice', password: 'Wrong123' });
      expect(response.status).toBe(401);
      expect(response.body.error.message).toBe('Invalid credentials');
    }
    expect(user.failedLoginAttempts).toBe(5);
    expect(user.lockUntil).toBeInstanceOf(Date);

    const locked = await request(app).post('/api/auth/login').send({ identifier: 'alice', password: 'Secret123' });
    expect(locked.status).toBe(423);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  test('logout requires a signed token', async () => {
    const unauthenticated = await request(app).post('/api/auth/logout');
    expect(unauthenticated.status).toBe(401);

    const token = jwt.sign({ sub: userId }, process.env.JWT_SECRET);
    const response = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(204);
  });
});
