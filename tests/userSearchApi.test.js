process.env.JWT_SECRET = 'tests-only-user-search-secret';

jest.mock('../src/models/User', () => ({ find: jest.fn() }));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src/app');
const User = require('../src/models/User');

describe('GET /api/users/search (CA-39)', () => {
  const app = createApp();
  const aliceId = '64b7f0c2a1b2c3d4e5f60718';
  const bobId = '64b7f0c2a1b2c3d4e5f60719';
  const bearer = (id = aliceId) => `Bearer ${jwt.sign({ sub: id }, process.env.JWT_SECRET)}`;

  beforeEach(() => User.find.mockReset());

  test('requires an authenticated user', async () => {
    const response = await request(app).get('/api/users/search?q=b');

    expect(response.status).toBe(401);
    expect(User.find).not.toHaveBeenCalled();
  });

  test('searches partial usernames case-insensitively and returns only public fields', async () => {
    const matches = [{ _id: bobId, username: 'bob' }];
    const query = {
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue(matches),
    };
    User.find.mockReturnValue(query);

    const response = await request(app)
      .get('/api/users/search?q=B')
      .set('Authorization', bearer());

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
  {
    userId: bobId,
    username: 'bob',
    displayName: 'bob',
    status: 'offline',
    lastSeen: null,
  },
]);
    expect(User.find).toHaveBeenCalledWith({
      _id: { $ne: aliceId },
      username: { $regex: 'B', $options: 'i' },
    });
    expect(query.select).toHaveBeenCalledWith('_id username lastSeen');
    expect(query.sort).toHaveBeenCalledWith({ username: 1 });
    expect(query.limit).toHaveBeenCalledWith(10);
  });

  test('escapes regex characters in the search text', async () => {
    const query = {
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    };
    User.find.mockReturnValue(query);

    const response = await request(app)
      .get('/api/users/search?q=b.')
      .set('Authorization', bearer());

    expect(response.status).toBe(200);
    expect(User.find).toHaveBeenCalledWith({
      _id: { $ne: aliceId },
      username: { $regex: 'b\\.', $options: 'i' },
    });
  });

  test('returns an empty list for blank queries and rejects queries over the username limit', async () => {
    const blank = await request(app)
      .get('/api/users/search?q=%20')
      .set('Authorization', bearer());
    const tooLong = await request(app)
      .get('/api/users/search?q=abcdefghijklmnopqrstu')
      .set('Authorization', bearer());

    expect(blank.status).toBe(200);
    expect(blank.body).toEqual([]);
    expect(tooLong.status).toBe(400);
    expect(User.find).not.toHaveBeenCalled();
  });
});
