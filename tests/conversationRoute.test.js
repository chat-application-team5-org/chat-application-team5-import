process.env.JWT_SECRET = 'tests-only-chat-secret';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
jest.mock('../src/modules/messaging/conversationService', () => ({
  getOrCreatePrivateConversation: jest.fn(),
}));
jest.mock('../src/models/Message', () => ({ find: jest.fn() }));
const { createApp } = require('../src/app');
const { getOrCreatePrivateConversation } = require('../src/modules/messaging/conversationService');
const Message = require('../src/models/Message');

describe('private conversation API authorization (CA-21)', () => {
  const app = createApp();
  const callerId = '64b7f0c2a1b2c3d4e5f60718';
  const otherId = '64b7f0c2a1b2c3d4e5f60719';
  const attackerId = '64b7f0c2a1b2c3d4e5f60720';
  const bearer = (id = callerId) => `Bearer ${jwt.sign({ sub: id }, process.env.JWT_SECRET)}`;

  beforeEach(() => {
    getOrCreatePrivateConversation.mockReset();
    const query = {};
    query.populate = jest.fn().mockReturnValue(query);
    query.sort = jest.fn().mockReturnValue(query);
    query.limit = jest.fn().mockResolvedValue([]);
    Message.find.mockReturnValue(query);
  });

  it('requires authentication before validating caller-supplied IDs', async () => {
    const res = await request(app)
      .post('/api/conversations/private')
      .send({ userId: callerId, otherUserId: otherId });
    expect(res.status).toBe(401);
    expect(getOrCreatePrivateConversation).not.toHaveBeenCalled();
  });

  it('rejects invalid participant IDs for an authenticated caller', async () => {
    const res = await request(app)
      .post('/api/conversations/private')
      .set('Authorization', bearer())
      .send({ otherUserId: 'y' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(getOrCreatePrivateConversation).not.toHaveBeenCalled();
  });

  it('uses the token identity and ignores a spoofed body userId', async () => {
    getOrCreatePrivateConversation.mockResolvedValue({ _id: new mongoose.Types.ObjectId() });
    const res = await request(app)
      .post('/api/conversations/private')
      .set('Authorization', bearer())
      .send({ userId: attackerId, otherUserId: otherId });

    expect(res.status).toBe(200);
    expect(getOrCreatePrivateConversation).toHaveBeenCalledWith(callerId, otherId);
  });

  it('supports the documented authenticated create route', async () => {
    getOrCreatePrivateConversation.mockResolvedValue({ _id: new mongoose.Types.ObjectId() });
    const res = await request(app)
      .post('/api/conversations')
      .set('Authorization', bearer())
      .send({ participantId: otherId });

    expect(res.status).toBe(200);
    expect(getOrCreatePrivateConversation).toHaveBeenCalledWith(callerId, otherId);
  });
});
