
jest.mock('../src/models/Conversation', () => ({
  create: jest.fn(),
}));

jest.mock('../src/models/User', () => ({
  findById: jest.fn(),
  find: jest.fn(),
}));

const Conversation = require('../src/models/Conversation');
const User = require('../src/models/User');
const { createGroup } = require('../src/modules/group/groupService');

const creatorId = '64b7f0c2a1b2c3d4e5f60718';
const member1Id = '64b7f0c2a1b2c3d4e5f60719';
const member2Id = '64b7f0c2a1b2c3d4e5f60720';

const creator = { _id: creatorId };
const members = [
  { _id: member1Id },
  { _id: member2Id },
];

describe('Group service (CA-29)', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    User.findById.mockResolvedValue(creator);
    User.find.mockResolvedValue(members);

    Conversation.create.mockImplementation(
      async (data) => ({ _id: 'group-1', ...data })
    );
  });

  it('creates a group with the creator as ADMIN', async () => {
    const group = await createGroup({
      creatorId,
      name: 'Project Team',
      memberIds: [member1Id, member2Id],
    });

    expect(Conversation.create).toHaveBeenCalledWith({
      type: 'group',
      name: 'Project Team',
      createdBy: creatorId,
      participants: [creatorId, member1Id, member2Id],
      memberRoles: [
        { user: creatorId, role: 'ADMIN' },
        { user: member1Id, role: 'MEMBER' },
        { user: member2Id, role: 'MEMBER' },
      ],
    });

    expect(group._id).toBe('group-1');
  });

  it('trims whitespace from the group name', async () => {
    await createGroup({
      creatorId,
      name: '  Project Team  ',
      memberIds: [member1Id, member2Id],
    });

    expect(Conversation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Project Team',
      })
    );
  });

  it('rejects a group name shorter than three characters', async () => {
    await expect(
      createGroup({
        creatorId,
        name: 'AB',
        memberIds: [member1Id, member2Id],
      })
    ).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });

    expect(Conversation.create).not.toHaveBeenCalled();
  });

  it('rejects a group name longer than fifty characters', async () => {
    await expect(
      createGroup({
        creatorId,
        name: 'A'.repeat(51),
        memberIds: [member1Id, member2Id],
      })
    ).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('rejects a missing group name', async () => {
    await expect(
      createGroup({
        creatorId,
        memberIds: [member1Id, member2Id],
      })
    ).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('rejects fewer than two other members', async () => {
    await expect(
      createGroup({
        creatorId,
        name: 'Project Team',
        memberIds: [member1Id],
      })
    ).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('rejects a non-array member list', async () => {
    await expect(
      createGroup({
        creatorId,
        name: 'Project Team',
        memberIds: member1Id,
      })
    ).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('rejects invalid member IDs', async () => {
    await expect(
      createGroup({
        creatorId,
        name: 'Project Team',
        memberIds: ['invalid-id', member2Id],
      })
    ).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('rejects duplicate member IDs', async () => {
    await expect(
      createGroup({
        creatorId,
        name: 'Project Team',
        memberIds: [member1Id, member1Id],
      })
    ).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('rejects the creator appearing in memberIds', async () => {
    await expect(
      createGroup({
        creatorId,
        name: 'Project Team',
        memberIds: [creatorId, member1Id],
      })
    ).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('rejects when the creator does not exist', async () => {
    User.findById.mockResolvedValue(null);

    await expect(
      createGroup({
        creatorId,
        name: 'Project Team',
        memberIds: [member1Id, member2Id],
      })
    ).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });

    expect(Conversation.create).not.toHaveBeenCalled();
  });

  it('rejects when one or more requested members do not exist', async () => {
    User.find.mockResolvedValue([members[0]]);

    await expect(
      createGroup({
        creatorId,
        name: 'Project Team',
        memberIds: [member1Id, member2Id],
      })
    ).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });

    expect(Conversation.create).not.toHaveBeenCalled();
  });
});
