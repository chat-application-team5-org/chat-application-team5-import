const mongoose = require('mongoose');

const Conversation = require('../../models/Conversation');
const User = require('../../models/User');
const { AppError } = require('../../middleware/errorHandler');

function validateGroupName(name) {
  if (typeof name !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', 'A group name is required.');
  }
  const normalized = name.trim();
  if (normalized.length < 3 || normalized.length > 50) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Group name must contain between 3 and 50 characters.');
  }
  return normalized;
}

async function getGroup(conversationId) {
  if (!mongoose.isValidObjectId(conversationId)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'A valid group ID is required.');
  }
  const group = await Conversation.findById(conversationId);
  if (!group || group.type !== 'group') {
    throw new AppError(404, 'NOT_FOUND', 'Group not found.');
  }
  return group;
}

function assertMember(group, userId) {
  if (!group.participants.some((id) => String(id) === String(userId))) {
    throw new AppError(403, 'FORBIDDEN_NOT_MEMBER', 'You are not a member of this group.');
  }
}

function assertAdmin(group, userId) {
  assertMember(group, userId);
  const role = group.memberRoles.find((entry) => String(entry.user) === String(userId));
  if (!role || role.role !== 'ADMIN') {
    throw new AppError(403, 'FORBIDDEN_NOT_ADMIN', 'Only a group admin can perform this action.');
  }
}

function groupSnapshot(group) {
  return {
    conversationId: String(group._id),
    type: 'GROUP',
    name: group.name,
    participants: group.participants.map(String),
  };
}

async function createGroup({ creatorId, name, memberIds }) {
  if (!mongoose.isValidObjectId(creatorId)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'A valid creator ID is required.');
  }
  const groupName = validateGroupName(name);
  if (!Array.isArray(memberIds) || memberIds.length < 2) {
    throw new AppError(400, 'VALIDATION_ERROR', 'A group must contain at least two other members.');
  }
  if (!memberIds.every((id) => mongoose.isValidObjectId(id))) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Every member ID must be valid.');
  }
  const normalizedMemberIds = memberIds.map((id) => String(id).toLowerCase());
  if (new Set(normalizedMemberIds).size !== normalizedMemberIds.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Duplicate group members are not allowed.');
  }
  if (normalizedMemberIds.includes(String(creatorId).toLowerCase())) {
    throw new AppError(400, 'VALIDATION_ERROR', 'The creator must not be included in memberIds.');
  }
  const [creator, members] = await Promise.all([
    User.findById(creatorId),
    User.find({ _id: { $in: normalizedMemberIds } }),
  ]);
  if (!creator) throw new AppError(404, 'NOT_FOUND', 'Group creator was not found.');
  if (members.length !== normalizedMemberIds.length) {
    throw new AppError(404, 'NOT_FOUND', 'One or more group members were not found.');
  }
  const participants = [creator._id, ...members.map((member) => member._id)];
  const memberRoles = [
    { user: creator._id, role: 'ADMIN' },
    ...members.map((member) => ({ user: member._id, role: 'MEMBER' })),
  ];
  return Conversation.create({
    type: 'group', name: groupName, createdBy: creator._id, participants, memberRoles,
  });
}

async function renameGroup({ conversationId, actorId, name }) {
  const group = await getGroup(conversationId);
  assertAdmin(group, actorId);
  group.name = validateGroupName(name);
  await group.save();
  return group;
}

async function addGroupMember({ conversationId, actorId, userId }) {
  const group = await getGroup(conversationId);
  assertAdmin(group, actorId);
  if (!mongoose.isValidObjectId(userId)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'A valid member ID is required.');
  }
  if (group.participants.some((id) => String(id) === String(userId))) {
    throw new AppError(409, 'ALREADY_MEMBER', 'This user is already a group member.');
  }
  const user = await User.findById(userId);
  if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found.');
  group.participants.push(user._id);
  group.memberRoles.push({ user: user._id, role: 'MEMBER' });
  await group.save();
  return group;
}

async function removeGroupMember({ conversationId, actorId, userId }) {
  const group = await getGroup(conversationId);
  assertAdmin(group, actorId);
  if (!mongoose.isValidObjectId(userId)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'A valid member ID is required.');
  }
  if (String(userId) === String(actorId)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Use the leave-group action to leave the group.');
  }
  if (!group.participants.some((id) => String(id) === String(userId))) {
    throw new AppError(404, 'NOT_FOUND', 'Group member not found.');
  }
  if (group.participants.length <= 3) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'A group must have at least three members. Add another member before removing someone.'
    );
  }
  group.participants = group.participants.filter((id) => String(id) !== String(userId));
  group.memberRoles = group.memberRoles.filter((entry) => String(entry.user) !== String(userId));
  await group.save();
  return group;
}

async function leaveGroup({ conversationId, actorId }) {
  const group = await getGroup(conversationId);
  assertMember(group, actorId);
  const leavingAdmin = String(group.createdBy) === String(actorId);
  group.participants = group.participants.filter((id) => String(id) !== String(actorId));
  group.memberRoles = group.memberRoles.filter((entry) => String(entry.user) !== String(actorId));

  if (group.participants.length < 3) {
    const remainingMemberIds = group.participants.map(String);
    await group.deleteOne();
    return { group, deleted: true, remainingMemberIds };
  }

  if (leavingAdmin) {
    const nextAdminId = group.participants[0];
    group.createdBy = nextAdminId;
    group.memberRoles = group.memberRoles.map((entry) => ({
      user: entry.user,
      role: String(entry.user) === String(nextAdminId) ? 'ADMIN' : 'MEMBER',
    }));
  }
  await group.save();
  return { group, deleted: false, remainingMemberIds: group.participants.map(String) };
}

module.exports = {
  createGroup,
  renameGroup,
  addGroupMember,
  removeGroupMember,
  leaveGroup,
  groupSnapshot,
};
