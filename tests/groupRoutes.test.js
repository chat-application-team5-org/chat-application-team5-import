
process.env.JWT_SECRET = 'tests-only-chat-secret';

const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../src/modules/group/groupService', () => ({
  createGroup: jest.fn(),
}));

jest.mock('../src/modules/group/groupEvents', () => ({
  publishGroupUpdate: jest.fn(),
}));

const { createGroup } = require('../src/modules/group/groupService');
const { publishGroupUpdate } = require('../src/modules/group/groupEvents');
const { createApp } = require('../src/app');
const { AppError } = require('../src/middleware/errorHandler');

const app = createApp();

const creatorId = '64b7f0c2a1b2c3d4e5f60718';
const member1Id = '64b7f0c2a1b2c3d4e5f60719';
const member2Id = '64b7f0c2a1b2c3d4e5f60720';
const conversationId = '64b7f0c2a1b2c3d4e5f60721';

const token = jwt.sign(
  { sub: creatorId },
  process.env.JWT_SECRET
);

const bearer = `Bearer ${token}`;

describe('Group routes (CA-29)', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    createGroup.mockResolvedValue({
      _id: conversationId,
      type: 'group',
      name: 'Project Team',
      participants: [creatorId, member1Id, member2Id],
      createdBy: creatorId,
    });
  });

  it('rejects group creation without authentication', async () => {
    const response = await request(app)
      .post('/api/groups')
      .send({
        name: 'Project Team',
        memberIds: [member1Id, member2Id],
      });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_FAILED');
    expect(createGroup).not.toHaveBeenCalled();
  });

  it('creates a group for the authenticated user', async () => {
    const response = await request(app)
      .post('/api/groups')
      .set('Authorization', bearer)
      .send({
        name: 'Project Team',
        memberIds: [member1Id, member2Id],
      });

    expect(response.status).toBe(201);

    expect(response.body).toEqual({
      conversation: {
        conversationId,
        type: 'GROUP',
        name: 'Project Team',
        participants: [creatorId, member1Id, member2Id],
      },
    });

    expect(createGroup).toHaveBeenCalledWith({
      creatorId,
      name: 'Project Team',
      memberIds: [member1Id, member2Id],
    });
  });

  it('publishes an ADDED event to the creator and every member', async () => {
    await request(app)
      .post('/api/groups')
      .set('Authorization', bearer)
      .send({
        name: 'Project Team',
        memberIds: [member1Id, member2Id],
      });

    const payload = {
      action: 'ADDED',
      conversation: {
        conversationId,
        type: 'GROUP',
        name: 'Project Team',
        participants: [creatorId, member1Id, member2Id],
      },
    };

    expect(publishGroupUpdate).toHaveBeenCalledTimes(3);

    expect(publishGroupUpdate).toHaveBeenNthCalledWith(
      1,
      creatorId,
      payload
    );

    expect(publishGroupUpdate).toHaveBeenNthCalledWith(
      2,
      member1Id,
      payload
    );

    expect(publishGroupUpdate).toHaveBeenNthCalledWith(
      3,
      member2Id,
      payload
    );
  });

  it('returns validation errors from the group service', async () => {
    createGroup.mockRejectedValue(
      new AppError(400, 'VALIDATION_ERROR', 'Group name must contain between 3 and 50 characters.')
    );

    const response = await request(app)
      .post('/api/groups')
      .set('Authorization', bearer)
      .send({
        name: 'AB',
        memberIds: [member1Id, member2Id],
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(publishGroupUpdate).not.toHaveBeenCalled();
  });
});
