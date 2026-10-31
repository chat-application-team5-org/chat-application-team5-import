process.env.JWT_SECRET = 'tests-only-chat-secret';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

jest.mock('../src/models/Conversation', () => ({
  find: jest.fn(),
  findById: jest.fn(),
}));
jest.mock('../src/models/Message', () => ({ find: jest.fn() }));
jest.mock('../src/modules/messaging/conversationService', () => ({
  getOrCreatePrivateConversation: jest.fn(),
}));

const Conversation = require('../src/models/Conversation');
const Message = require('../src/models/Message');
const { getOrCreatePrivateConversation } = require('../src/modules/messaging/conversationService');
const { createApp } = require('../src/app');

const app = createApp();
const callerId = '64b7f0c2a1b2c3d4e5f60718';
const participantId = '64b7f0c2a1b2c3d4e5f60719';
const conversationId = '64b7f0c2a1b2c3d4e5f60720';
const bearer = `Bearer ${jwt.sign({ sub: callerId }, process.env.JWT_SECRET)}`;

function mockMessageQuery(rows = []) {
  const query = {
    populate: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(rows),
  };
  Message.find.mockReturnValue(query);
  return query;
}

function historyConversation(participants = [callerId, participantId]) {
  Conversation.findById.mockResolvedValue({
    _id: conversationId,
    participants,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('conversation listing and creation routes', () => {
  it('lists private and group conversations and handles a participant-less record safely', async () => {
    const query = {
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockResolvedValue([
        { _id: 'private-1', type: 'private', participants: [{ _id: callerId }, { _id: participantId, username: 'bob' }] },
        { _id: 'group-1', type: 'group', participants: [{ _id: callerId }, { _id: participantId, username: 'bob' }] },
        { _id: 'private-2', type: 'private', participants: [{ _id: callerId }] },
      ]),
    };
    Conversation.find.mockReturnValue(query);

    const response = await request(app).get('/api/conversations').set('Authorization', bearer);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      { conversationId: 'private-1', type: 'PRIVATE', name: 'bob', lastMessage: '', unreadCount: 0 },
      { conversationId: 'group-1', type: 'GROUP', name: 'bob', lastMessage: '', unreadCount: 0 },
      { conversationId: 'private-2', type: 'PRIVATE', name: 'Private conversation', lastMessage: '', unreadCount: 0 },
    ]);
    expect(Conversation.find).toHaveBeenCalledWith({ participants: callerId });
    expect(query.sort).toHaveBeenCalledWith({ updatedAt: -1 });
  });

  it('returns recent messages oldest-first when creating a conversation', async () => {
    const conversation = { _id: conversationId };
    getOrCreatePrivateConversation.mockResolvedValue(conversation);
    const newestFirst = [{ _id: 'm3' }, { _id: 'm2' }, { _id: 'm1' }];
    const query = mockMessageQuery(newestFirst);

    const response = await request(app)
      .post('/api/conversations')
      .set('Authorization', bearer)
      .send({ participantId });

    expect(response.status).toBe(200);
    expect(response.body.messages.map((message) => message._id)).toEqual(['m1', 'm2', 'm3']);
    expect(query.sort).toHaveBeenCalledWith({ _id: -1 });
    expect(query.limit).toHaveBeenCalledWith(50);
  });
});

describe('conversation history authorization and pagination routes', () => {
  it('returns 404 when the conversation does not exist', async () => {
    Conversation.findById.mockResolvedValue(null);

    const response = await request(app)
      .get(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', bearer);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(Message.find).not.toHaveBeenCalled();
  });

  it('denies history to a user outside the conversation', async () => {
    historyConversation([participantId]);

    const response = await request(app)
      .get(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', bearer);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN_NOT_MEMBER');
    expect(Message.find).not.toHaveBeenCalled();
  });

  it('rejects conflicting before and after cursors without querying messages', async () => {
    historyConversation();

    const response = await request(app)
      .get(`/api/conversations/${conversationId}/messages?before=${participantId}&after=${participantId}`)
      .set('Authorization', bearer);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(Message.find).not.toHaveBeenCalled();
  });

  it.each(['before', 'after'])('rejects malformed %s cursors', async (cursor) => {
    historyConversation();

    const response = await request(app)
      .get(`/api/conversations/${conversationId}/messages?${cursor}=invalid`)
      .set('Authorization', bearer);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(Message.find).not.toHaveBeenCalled();
  });

  it('loads the latest page chronologically and provides a cursor when older results remain', async () => {
    historyConversation();
    const rowsNewestFirst = Array.from({ length: 51 }, (_, index) => ({
      _id: String(index + 1).padStart(24, '0'),
    })).reverse();
    const query = mockMessageQuery(rowsNewestFirst);

    const response = await request(app)
      .get(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', bearer);

    expect(response.status).toBe(200);
    expect(response.body.messages).toHaveLength(50);
    expect(response.body.messages[0]._id).toBe('000000000000000000000002');
    expect(response.body.messages[49]._id).toBe('000000000000000000000051');
    expect(response.body.hasMore).toBe(true);
    expect(response.body.nextCursor).toBe('000000000000000000000002');
    expect(query.limit).toHaveBeenCalledWith(51);
  });

  it('loads older messages before a cursor in chronological order', async () => {
    historyConversation();
    const cursor = new mongoose.Types.ObjectId('64b7f0c2a1b2c3d4e5f60725');
    const rows = [{ _id: 'older-2' }, { _id: 'older-1' }];
    const query = mockMessageQuery(rows);

    const response = await request(app)
      .get(`/api/conversations/${conversationId}/messages?before=${cursor}&limit=2`)
      .set('Authorization', bearer);

    expect(response.status).toBe(200);
    expect(response.body.messages.map((message) => message._id)).toEqual(['older-1', 'older-2']);
    expect(response.body.hasMore).toBe(false);
    expect(response.body.nextCursor).toBeNull();
    expect(Message.find).toHaveBeenCalledWith({
      conversation: conversationId,
      _id: { $lt: cursor },
    });
    expect(query.sort).toHaveBeenCalledWith({ _id: -1 });
    expect(query.limit).toHaveBeenCalledWith(3);
  });

  it('loads newer messages in ascending order and caps the requested page size', async () => {
    historyConversation();
    const cursor = new mongoose.Types.ObjectId('64b7f0c2a1b2c3d4e5f60725');
    const rows = Array.from({ length: 101 }, (_, index) => ({ _id: `newer-${index + 1}` }));
    const query = mockMessageQuery(rows);

    const response = await request(app)
      .get(`/api/conversations/${conversationId}/messages?after=${cursor}&limit=999`)
      .set('Authorization', bearer);

    expect(response.status).toBe(200);
    expect(response.body.messages).toHaveLength(100);
    expect(response.body.messages[0]._id).toBe('newer-1');
    expect(response.body.messages[99]._id).toBe('newer-100');
    expect(response.body.hasMore).toBe(true);
    expect(response.body.nextCursor).toBe('newer-100');
    expect(Message.find).toHaveBeenCalledWith({
      conversation: conversationId,
      _id: { $gt: cursor },
    });
    expect(query.sort).toHaveBeenCalledWith({ _id: 1 });
    expect(query.limit).toHaveBeenCalledWith(101);
  });

  it('uses the default page size for a non-numeric limit and handles an empty result', async () => {
    historyConversation();
    const query = mockMessageQuery([]);

    const response = await request(app)
      .get(`/api/conversations/${conversationId}/messages?limit=not-a-number`)
      .set('Authorization', bearer);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ messages: [], hasMore: false, nextCursor: null });
    expect(query.limit).toHaveBeenCalledWith(51);
  });
});
