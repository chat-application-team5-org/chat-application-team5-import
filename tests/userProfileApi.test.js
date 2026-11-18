process.env.JWT_SECRET = 'tests-only-user-profile-secret';

jest.mock('../src/models/User', () => ({
  find: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const User = require('../src/models/User');
const { createApp } = require('../src/app');

const app = createApp();
const userId = '64b7f0c2a1b2c3d4e5f60718';
const token = jwt.sign({ sub: userId }, process.env.JWT_SECRET);
const bearer = `Bearer ${token}`;

function selectQuery(value) {
  return {
    select: jest.fn().mockResolvedValue(value),
  };
}

describe('User profile API (CA-40, CA-41)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/users/me', () => {
    test('requires authentication', async () => {
      const response = await request(app).get('/api/users/me');

      expect(response.status).toBe(401);
      expect(User.findById).not.toHaveBeenCalled();
    });

    test('returns the authenticated user profile', async () => {
      const user = {
        _id: userId,
        username: 'alice',
        email: 'alice@example.com',
        displayName: 'Alice Example',
        statusMessage: 'Working on Sprint 3',
      };
      const query = selectQuery(user);
      User.findById.mockReturnValue(query);

      const response = await request(app)
        .get('/api/users/me')
        .set('Authorization', bearer);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        profile: {
          userId,
          username: 'alice',
          displayName: 'Alice Example',
          statusMessage: 'Working on Sprint 3',
        },
      });
      expect(User.findById).toHaveBeenCalledWith(userId);
      expect(query.select).toHaveBeenCalledWith(
        '_id username email displayName statusMessage'
      );
    });

    test('returns 404 when the authenticated user no longer exists', async () => {
      User.findById.mockReturnValue(selectQuery(null));

      const response = await request(app)
        .get('/api/users/me')
        .set('Authorization', bearer);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('PATCH /api/users/me', () => {
    test.each([
      ['an empty body', {}],
      ['an unknown field', { username: 'newname' }],
      ['a mixture of allowed and unknown fields', {
        displayName: 'Alice',
        isAdmin: true,
      }],
    ])('rejects %s', async (_label, body) => {
      const response = await request(app)
        .patch('/api/users/me')
        .set('Authorization', bearer)
        .send(body);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    test.each([
      ['a non-string display name', { displayName: 123 }],
      ['a display name over 40 characters', { displayName: 'A'.repeat(41) }],
      ['a non-string status message', { statusMessage: 123 }],
      ['a status message over 100 characters', { statusMessage: 'S'.repeat(101) }],
    ])('rejects %s', async (_label, body) => {
      const response = await request(app)
        .patch('/api/users/me')
        .set('Authorization', bearer)
        .send(body);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    test('trims and saves valid public profile fields', async () => {
      const updatedUser = {
        _id: userId,
        username: 'alice',
        displayName: 'Alice Example',
        statusMessage: 'Available now',
      };
      const query = selectQuery(updatedUser);
      User.findByIdAndUpdate.mockReturnValue(query);

      const response = await request(app)
        .patch('/api/users/me')
        .set('Authorization', bearer)
        .send({
          displayName: '  Alice Example  ',
          statusMessage: '  Available now  ',
        });

      expect(response.status).toBe(200);
      expect(response.body.profile).toEqual({
        userId,
        username: 'alice',
        displayName: 'Alice Example',
        statusMessage: 'Available now',
      });
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        userId,
        { $set: { displayName: 'Alice Example', statusMessage: 'Available now' } },
        { new: true, runValidators: true }
      );
      expect(query.select).toHaveBeenCalledWith(
        '_id username displayName statusMessage'
      );
    });

    test('uses the username when the saved display name is empty', async () => {
      const updatedUser = {
        _id: userId,
        username: 'alice',
        displayName: '',
        statusMessage: '',
      };
      User.findByIdAndUpdate.mockReturnValue(selectQuery(updatedUser));

      const response = await request(app)
        .patch('/api/users/me')
        .set('Authorization', bearer)
        .send({ displayName: '   ' });

      expect(response.status).toBe(200);
      expect(response.body.profile.displayName).toBe('alice');
      expect(response.body.profile.statusMessage).toBe('');
    });

    test('returns 404 when the user cannot be updated', async () => {
      User.findByIdAndUpdate.mockReturnValue(selectQuery(null));

      const response = await request(app)
        .patch('/api/users/me')
        .set('Authorization', bearer)
        .send({ displayName: 'Alice' });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('PUT /api/users/me/password', () => {
    test.each([
      ['a missing current password', { newPassword: 'NewPass123' }],
      ['an empty current password', {
        currentPassword: '',
        newPassword: 'NewPass123',
      }],
      ['a non-string current password', {
        currentPassword: 123,
        newPassword: 'NewPass123',
      }],
      ['a non-string new password', {
        currentPassword: 'OldPass123',
        newPassword: 123,
      }],
      ['a password shorter than eight characters', {
        currentPassword: 'OldPass123',
        newPassword: 'Short1',
      }],
      ['a password without a letter', {
        currentPassword: 'OldPass123',
        newPassword: '12345678',
      }],
      ['a password without a digit', {
        currentPassword: 'OldPass123',
        newPassword: 'NewPassword',
      }],
    ])('rejects %s', async (_label, body) => {
      const response = await request(app)
        .put('/api/users/me/password')
        .set('Authorization', bearer)
        .send(body);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(User.findById).not.toHaveBeenCalled();
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    test('returns 404 when the user does not exist', async () => {
      User.findById.mockResolvedValue(null);

      const response = await request(app)
        .put('/api/users/me/password')
        .set('Authorization', bearer)
        .send({
          currentPassword: 'OldPass123',
          newPassword: 'NewPass123',
        });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    test('rejects an incorrect current password', async () => {
      User.findById.mockResolvedValue({ passwordHash: 'stored-hash' });
      bcrypt.compare.mockResolvedValue(false);

      const response = await request(app)
        .put('/api/users/me/password')
        .set('Authorization', bearer)
        .send({
          currentPassword: 'WrongPass123',
          newPassword: 'NewPass123',
        });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
      expect(bcrypt.compare).toHaveBeenCalledTimes(1);
    });

    test('rejects a new password identical to the current password', async () => {
      User.findById.mockResolvedValue({ passwordHash: 'stored-hash' });
      bcrypt.compare
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true);

      const response = await request(app)
        .put('/api/users/me/password')
        .set('Authorization', bearer)
        .send({
          currentPassword: 'OldPass123',
          newPassword: 'OldPass123',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(bcrypt.compare).toHaveBeenCalledTimes(2);
    });

    test('hashes and saves a different valid password', async () => {
      const user = {
        passwordHash: 'old-hash',
        save: jest.fn().mockResolvedValue(undefined),
      };
      User.findById.mockResolvedValue(user);
      bcrypt.compare
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      bcrypt.hash.mockResolvedValue('new-hash');

      const response = await request(app)
        .put('/api/users/me/password')
        .set('Authorization', bearer)
        .send({
          currentPassword: 'OldPass123',
          newPassword: 'NewPass456',
        });

      expect(response.status).toBe(204);
      expect(bcrypt.hash).toHaveBeenCalledWith('NewPass456', 10);
      expect(user.passwordHash).toBe('new-hash');
      expect(user.save).toHaveBeenCalledTimes(1);
    });
  });
});
