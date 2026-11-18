const express = require('express');

const { currentUser } = require('../../middleware/currentUser');
const {
  createGroup,
  getGroupDetails,
  renameGroup,
  addGroupMember,
  removeGroupMember,
  leaveGroup,
  groupSnapshot,
} = require('./groupService');
const { publishGroupUpdate } = require('./groupEvents');

const router = express.Router();

router.use(currentUser);

function notify(recipientIds, action, group, extra = {}) {
  const payload = { action, conversation: groupSnapshot(group), ...extra };
  [...new Set(recipientIds.map(String))].forEach((id) => publishGroupUpdate(id, payload));
}

// POST /api/groups
router.post('/', async (req, res, next) => {
  try {
    const { name, memberIds } = req.body || {};
    const conversation = await createGroup({ creatorId: req.userId, name, memberIds });
    const group = groupSnapshot(conversation);
    notify(group.participants, 'ADDED', conversation);
    res.status(201).json({ conversation: group });
  } catch (error) {
    next(error);
  }
});


// GET /api/groups/:id — group info, visible only to current members.
router.get('/:id', async (req, res, next) => {
  try {
    const conversation = await getGroupDetails({
      conversationId: req.params.id,
      actorId: req.userId,
    });
    res.status(200).json({ conversation });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/groups/:id — admin-only rename.
router.patch('/:id', async (req, res, next) => {
  try {
    const group = await renameGroup({
      conversationId: req.params.id, actorId: req.userId, name: (req.body || {}).name,
    });
    notify(group.participants, 'RENAMED', group);
    res.status(200).json({ conversation: groupSnapshot(group) });
  } catch (error) {
    next(error);
  }
});

// POST /api/groups/:id/members — admin-only add.
router.post('/:id/members', async (req, res, next) => {
  try {
    const group = await addGroupMember({
      conversationId: req.params.id, actorId: req.userId, userId: (req.body || {}).userId,
    });
    notify(group.participants, 'ADDED', group);
    res.status(200).json({ conversation: groupSnapshot(group) });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/groups/:id/members/:userId — admin-only remove.
router.delete('/:id/members/:userId', async (req, res, next) => {
  try {
    const group = await removeGroupMember({
      conversationId: req.params.id, actorId: req.userId, userId: req.params.userId,
    });
    notify([...group.participants.map(String), req.params.userId], 'REMOVED', group, {
      memberId: req.params.userId,
    });
    res.status(200).json({ conversation: groupSnapshot(group) });
  } catch (error) {
    next(error);
  }
});

// POST /api/groups/:id/leave — any member may leave.
router.post('/:id/leave', async (req, res, next) => {
  try {
    const result = await leaveGroup({ conversationId: req.params.id, actorId: req.userId });
    const payloadGroup = result.group;
    const snapshot = groupSnapshot(payloadGroup);
    const recipients = [...result.remainingMemberIds, req.userId];
    recipients.forEach((id) => publishGroupUpdate(id, {
      action: 'LEFT', conversation: snapshot, memberId: req.userId, deleted: result.deleted,
    }));
    res.status(200).json({ left: true, deleted: result.deleted });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
