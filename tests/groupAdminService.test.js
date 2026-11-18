jest.mock('../src/models/Conversation', () => ({
  create: jest.fn(),
  findById: jest.fn(),
}));

jest.mock('../src/models/User', () => ({
  findById: jest.fn(),
  find: jest.fn(),
}));

const Conversation = require('../src/models/Conversation');
const User = require('../src/models/User');
const {
  renameGroup,
  addGroupMember,
  removeGroupMember,
  leaveGroup,
} = require('../src/modules/group/groupService');

const creatorId = '64b7f0c2a1b2c3d4e5f60718';
const member1Id = '64b7f0c2a1b2c3d4e5f60719';
const member2Id = '64b7f0c2a1b2c3d4e5f60720';
const member3Id = '64b7f0c2a1b2c3d4e5f60721';
const member4Id = '64b7f0c2a1b2c3d4e5f60722';
const newMemberId = '64b7f0c2a1b2c3d4e5f60723';
const groupId = '64b7f0c2a1b2c3d4e5f60724';

function makeGroup(participantIds = [creatorId, member1Id, member2Id]) {
  return {
    _id: groupId,
    type: 'group',
    name: 'Project Team',
    createdBy: creatorId,
    participants: participantIds.slice(),
    memberRoles: participantIds.map((id) => ({
      user: id,
      role: id === creatorId ? 'ADMIN' : 'MEMBER',
    })),
    save: jest.fn().mockResolvedValue(undefined),
    deleteOne: jest.fn().mockResolvedValue(undefined),
  };
}

describe('Group administration service (CA-32)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('shared group authorization and lookup', () => {
    test('rejects an invalid conversation ID', async () => {
      await expect(renameGroup({
        conversationId: 'not-an-object-id',
        actorId: creatorId,
        name: 'Renamed Team',
      })).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
      expect(Conversation.findById).not.toHaveBeenCalled();
    });

    test('returns not found when the group does not exist', async () => {
      Conversation.findById.mockResolvedValue(null);
      await expect(renameGroup({
        conversationId: groupId,
        actorId: creatorId,
        name: 'Renamed Team',
      })).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    });

    test('rejects a private conversation as a group', async () => {
      Conversation.findById.mockResolvedValue({ type: 'private' });
      await expect(renameGroup({
        conversationId: groupId,
        actorId: creatorId,
        name: 'Renamed Team',
      })).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    });

    test('rejects a user who is not a group member', async () => {
      Conversation.findById.mockResolvedValue(makeGroup());
      await expect(renameGroup({
        conversationId: groupId,
        actorId: newMemberId,
        name: 'Renamed Team',
      })).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN_NOT_MEMBER' });
    });

    test('rejects a member who is not an admin', async () => {
      Conversation.findById.mockResolvedValue(makeGroup());
      await expect(renameGroup({
        conversationId: groupId,
        actorId: member1Id,
        name: 'Renamed Team',
      })).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN_NOT_ADMIN' });
    });
  });

  describe('renameGroup', () => {
    test.each([undefined, 'AB', 'A'.repeat(51)])(
      'rejects invalid group names (%s)',
      async (name) => {
        Conversation.findById.mockResolvedValue(makeGroup());
        await expect(renameGroup({
          conversationId: groupId,
          actorId: creatorId,
          name,
        })).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
      }
    );

    test('trims and saves a valid group name', async () => {
      const group = makeGroup();
      Conversation.findById.mockResolvedValue(group);

      await expect(renameGroup({
        conversationId: groupId,
        actorId: creatorId,
        name: '  Release Team  ',
      })).resolves.toBe(group);

      expect(group.name).toBe('Release Team');
      expect(group.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('addGroupMember', () => {
    test('rejects an invalid user ID', async () => {
      Conversation.findById.mockResolvedValue(makeGroup());
      await expect(addGroupMember({
        conversationId: groupId,
        actorId: creatorId,
        userId: 'invalid-id',
      })).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
      expect(User.findById).not.toHaveBeenCalled();
    });

    test('rejects a user who is already a member', async () => {
      Conversation.findById.mockResolvedValue(makeGroup());
      await expect(addGroupMember({
        conversationId: groupId,
        actorId: creatorId,
        userId: member1Id,
      })).rejects.toMatchObject({ status: 409, code: 'ALREADY_MEMBER' });
      expect(User.findById).not.toHaveBeenCalled();
    });

    test('returns not found when the requested user does not exist', async () => {
      Conversation.findById.mockResolvedValue(makeGroup());
      User.findById.mockResolvedValue(null);
      await expect(addGroupMember({
        conversationId: groupId,
        actorId: creatorId,
        userId: newMemberId,
      })).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    });

    test('adds a new member with the MEMBER role', async () => {
      const group = makeGroup();
      Conversation.findById.mockResolvedValue(group);
      User.findById.mockResolvedValue({ _id: newMemberId });

      await expect(addGroupMember({
        conversationId: groupId,
        actorId: creatorId,
        userId: newMemberId,
      })).resolves.toBe(group);

      expect(group.participants.map(String)).toContain(newMemberId);
      expect(group.memberRoles).toContainEqual({
        user: newMemberId,
        role: 'MEMBER',
      });
      expect(group.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('removeGroupMember', () => {
    test('rejects an invalid user ID', async () => {
      Conversation.findById.mockResolvedValue(makeGroup());
      await expect(removeGroupMember({
        conversationId: groupId,
        actorId: creatorId,
        userId: 'invalid-id',
      })).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    });

    test('requires a member to use leaveGroup instead of removing themselves', async () => {
      Conversation.findById.mockResolvedValue(makeGroup());
      await expect(removeGroupMember({
        conversationId: groupId,
        actorId: creatorId,
        userId: creatorId,
      })).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    });

    test('returns not found when the target is not a member', async () => {
      Conversation.findById.mockResolvedValue(makeGroup());
      await expect(removeGroupMember({
        conversationId: groupId,
        actorId: creatorId,
        userId: newMemberId,
      })).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    });

    test('prevents removal when the group has only three members', async () => {
      const group = makeGroup();
      Conversation.findById.mockResolvedValue(group);
      await expect(removeGroupMember({
        conversationId: groupId,
        actorId: creatorId,
        userId: member1Id,
      })).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
      expect(group.save).not.toHaveBeenCalled();
    });

    test('removes a member when the group has more than three members', async () => {
      const group = makeGroup([creatorId, member1Id, member2Id, member3Id]);
      Conversation.findById.mockResolvedValue(group);

      await expect(removeGroupMember({
        conversationId: groupId,
        actorId: creatorId,
        userId: member3Id,
      })).resolves.toBe(group);

      expect(group.participants.map(String)).not.toContain(member3Id);
      expect(group.memberRoles.map((entry) => String(entry.user))).not.toContain(member3Id);
      expect(group.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('leaveGroup', () => {
    test('rejects a user who is not a member', async () => {
      Conversation.findById.mockResolvedValue(makeGroup());
      await expect(leaveGroup({
        conversationId: groupId,
        actorId: newMemberId,
      })).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN_NOT_MEMBER' });
    });

    test('deletes a three-member group when a member leaves', async () => {
      const group = makeGroup();
      Conversation.findById.mockResolvedValue(group);

      const result = await leaveGroup({
        conversationId: groupId,
        actorId: member1Id,
      });

      expect(result.deleted).toBe(true);
      expect(result.remainingMemberIds).toEqual([creatorId, member2Id]);
      expect(group.deleteOne).toHaveBeenCalledTimes(1);
      expect(group.save).not.toHaveBeenCalled();
    });

    test('deletes a group when its last member leaves', async () => {
      const group = makeGroup([creatorId]);
      Conversation.findById.mockResolvedValue(group);

      const result = await leaveGroup({
        conversationId: groupId,
        actorId: creatorId,
      });

      expect(result.deleted).toBe(true);
      expect(result.remainingMemberIds).toEqual([]);
      expect(group.deleteOne).toHaveBeenCalledTimes(1);
    });

    test('transfers admin rights when the creator leaves a larger group', async () => {
      const group = makeGroup([creatorId, member1Id, member2Id, member3Id]);
      Conversation.findById.mockResolvedValue(group);

      const result = await leaveGroup({
        conversationId: groupId,
        actorId: creatorId,
      });

      expect(result.deleted).toBe(false);
      expect(result.remainingMemberIds).toEqual([member1Id, member2Id, member3Id]);
      expect(group.createdBy).toBe(member1Id);
      expect(group.memberRoles.find((entry) => String(entry.user) === member1Id).role)
        .toBe('ADMIN');
      expect(group.memberRoles.filter((entry) => entry.role === 'ADMIN')).toHaveLength(1);
      expect(group.save).toHaveBeenCalledTimes(1);
      expect(group.deleteOne).not.toHaveBeenCalled();
    });

    test('keeps the admin unchanged when an ordinary member leaves a larger group', async () => {
      const group = makeGroup([creatorId, member1Id, member2Id, member3Id]);
      Conversation.findById.mockResolvedValue(group);

      const result = await leaveGroup({
        conversationId: groupId,
        actorId: member2Id,
      });

      expect(result.deleted).toBe(false);
      expect(result.remainingMemberIds).toEqual([creatorId, member1Id, member3Id]);
      expect(group.createdBy).toBe(creatorId);
      expect(group.memberRoles.find((entry) => String(entry.user) === creatorId).role)
        .toBe('ADMIN');
      expect(group.save).toHaveBeenCalledTimes(1);
    });
  });
});
