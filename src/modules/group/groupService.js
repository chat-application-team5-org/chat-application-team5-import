
const mongoose = require('mongoose');

const Conversation = require('../../models/Conversation');
const User = require('../../models/User');
const { AppError } = require('../../middleware/errorHandler');

async function createGroup({ creatorId, name, memberIds }) {
  // Validate creator identity.
  if (!mongoose.isValidObjectId(creatorId)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'A valid creator ID is required.');
  }

  // Validate and normalize the group name.
  if (typeof name !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', 'A group name is required.');
  }

  const groupName = name.trim();

  if (groupName.length < 3 || groupName.length > 50) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Group name must contain between 3 and 50 characters.'
    );
  }

  // At least two other users must be supplied.
  if (!Array.isArray(memberIds) || memberIds.length < 2) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'A group must contain at least two other members.'
    );
  }

  // Validate member IDs.
  if (!memberIds.every((id) => mongoose.isValidObjectId(id))) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Every member ID must be valid.'
    );
  }

  const normalizedMemberIds = memberIds.map(
    (id) => String(id).toLowerCase()
  );

  // Reject duplicates rather than silently removing them.
  if (new Set(normalizedMemberIds).size !== normalizedMemberIds.length) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Duplicate group members are not allowed.'
    );
  }

  // memberIds contains other users, not the creator.
  if (normalizedMemberIds.includes(String(creatorId).toLowerCase())) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'The creator must not be included in memberIds.'
    );
  }

  // Confirm that the creator and every requested member exist.
  const [creator, members] = await Promise.all([
    User.findById(creatorId),
    User.find({ _id: { $in: normalizedMemberIds } }),
  ]);

  if (!creator) {
    throw new AppError(404, 'NOT_FOUND', 'Group creator was not found.');
  }

  if (members.length !== normalizedMemberIds.length) {
    throw new AppError(
      404,
      'NOT_FOUND',
      'One or more group members were not found.'
    );
  }

  const participants = [
    creator._id,
    ...members.map((member) => member._id),
  ];

  // The creator is the sole ADMIN; all other participants are MEMBERs.
  const memberRoles = [
    { user: creator._id, role: 'ADMIN' },
    ...members.map((member) => ({
      user: member._id,
      role: 'MEMBER',
    })),
  ];

  return Conversation.create({
    type: 'group',
    name: groupName,
    createdBy: creator._id,
    participants,
    memberRoles,
  });
}

module.exports = { createGroup };
