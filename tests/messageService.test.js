const mongoose = require('mongoose');

jest.mock('../src/models/Conversation', () => ({
  findById: jest.fn(),
  find: jest.fn(),
}));
jest.mock('../src/models/Message', () => ({
  create: jest.fn(),
  find: jest.fn(),
  findById: jest.fn(),
  updateOne: jest.fn(),
  updateMany: jest.fn(),
}));

const Conversation = require('../src/models/Conversation');
const Message = require('../src/models/Message');
const {
  sendMessage,
  loadPendingMessagesForRecipient,
  markMessageDelivered,
  markMessagesRead,
} = require('../src/modules/messaging/messageService');

const oid = () => new mongoose.Types.ObjectId();
const sender = oid();
const other = oid();
const convId = oid();

beforeEach(() => {
  jest.resetAllMocks();
  Conversation.findById.mockResolvedValue({ _id: convId, participants: [sender, other] });
});

describe('sendMessage (CA-27)', () => {
  it('saves the message and returns the recipients', async () => {
    const savedMessage = { _id: 'm1', populate: jest.fn().mockResolvedValue({ _id: 'm1' }) };
    Message.create.mockResolvedValue(savedMessage);
    const result = await sendMessage({ senderId: sender, conversationId: String(convId), content: 'Hi' });
    expect(Message.create).toHaveBeenCalledTimes(1);
    expect(savedMessage.populate).toHaveBeenCalledWith('sender', 'username');
    expect(result.message).toMatchObject({ _id: 'm1' });
    expect(result.recipientIds).toEqual([String(other)]);
  });
  it('rejects (no success) when the database save fails', async () => {
    Message.create.mockRejectedValue(new Error('db down'));
    await expect(
      sendMessage({ senderId: sender, conversationId: String(convId), content: 'Hi' })
    ).rejects.toThrow('db down');
  });
  it('does not save invalid content', async () => {
    await expect(
      sendMessage({ senderId: sender, conversationId: String(convId), content: '   ' })
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(Message.create).not.toHaveBeenCalled();
  });
  it('does not save for a non-member', async () => {
    await expect(
      sendMessage({ senderId: oid(), conversationId: String(convId), content: 'Hi' })
    ).rejects.toMatchObject({ code: 'FORBIDDEN_NOT_MEMBER' });
    expect(Message.create).not.toHaveBeenCalled();
  });
  it('rejects an unknown conversation', async () => {
    Conversation.findById.mockResolvedValue(null);
    await expect(
      sendMessage({ senderId: sender, conversationId: String(convId), content: 'Hi' })
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('loadPendingMessagesForRecipient (CA-24)', () => {
  it('loads only unacknowledged incoming messages in the recipient conversations', async () => {
    const conversations = [{ _id: convId }];
    const select = jest.fn().mockResolvedValue(conversations);
    Conversation.find.mockReturnValue({ select });
    const pending = [{ _id: oid(), content: 'Offline hello' }];
    const sort = jest.fn().mockResolvedValue(pending);
    const populate = jest.fn().mockReturnValue({ sort });
    Message.find.mockReturnValue({ populate });

    await expect(loadPendingMessagesForRecipient({ recipientId: other })).resolves.toBe(pending);
    expect(Conversation.find).toHaveBeenCalledWith({ participants: other });
    expect(select).toHaveBeenCalledWith('_id');
    expect(Message.find).toHaveBeenCalledWith({
      conversation: { $in: [convId] },
      sender: { $ne: other },
      status: 'SENT',
      $or: [
        { recipientIds: { $in: [other] }, deliveredTo: { $ne: other } },
        { recipientIds: { $exists: false }, deliveredTo: { $ne: other } },
        { recipientIds: { $size: 0 }, deliveredTo: { $ne: other } },
      ],
    });
    expect(populate).toHaveBeenCalledWith('sender', 'username');
    expect(sort).toHaveBeenCalledWith({ createdAt: 1, _id: 1 });
  });

  it('does not query messages when the recipient has no conversations', async () => {
    const select = jest.fn().mockResolvedValue([]);
    Conversation.find.mockReturnValue({ select });
    await expect(loadPendingMessagesForRecipient({ recipientId: other })).resolves.toEqual([]);
    expect(Message.find).not.toHaveBeenCalled();
  });
});

describe('markMessageDelivered (CA-24)', () => {
  const saved = () => ({
    _id: oid(),
    conversation: convId,
    sender,
    clientMsgId: 'client-message-1',
    recipientIds: [other],
    deliveredTo: [],
    status: 'SENT',
  });

  it('marks a message delivered only after a valid recipient acknowledges it', async () => {
    const message = saved();

    Message.findById
      .mockResolvedValueOnce(message)
      .mockResolvedValueOnce({ ...message, deliveredTo: [other] })
      .mockResolvedValueOnce({
        ...message,
        deliveredTo: [other],
        status: 'DELIVERED',
      });

    Message.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const result = await markMessageDelivered({
      recipientId: other,
      messageId: String(message._id),
    });

    expect(result.newlyDelivered).toBe(true);
    expect(result.message).toMatchObject({ status: 'DELIVERED' });

    expect(Message.updateOne).toHaveBeenNthCalledWith(
      1,
      { _id: message._id, deliveredTo: { $ne: other } },
      { $addToSet: { deliveredTo: other } }
    );

    expect(Message.updateOne).toHaveBeenNthCalledWith(
      2,
      { _id: message._id, status: 'SENT' },
      { $set: { status: 'DELIVERED' } }
    );
  });

  it('keeps a group message pending until every recipient acknowledges it', async () => {
    const third = oid();
    const messageId = oid();

    const initial = {
      _id: messageId,
      conversation: convId,
      sender,
      clientMsgId: 'group-message-1',
      recipientIds: [other, third],
      deliveredTo: [],
      status: 'SENT',
    };

    const partiallyDelivered = {
      ...initial,
      deliveredTo: [other],
    };

    Conversation.findById.mockResolvedValue({
      _id: convId,
      participants: [sender, other, third],
    });

    Message.findById
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(partiallyDelivered);

    Message.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const firstAck = await markMessageDelivered({
      recipientId: other,
      messageId: String(messageId),
    });

    expect(firstAck.newlyDelivered).toBe(false);
    expect(firstAck.message.status).toBe('SENT');
    expect(Message.updateOne).toHaveBeenCalledTimes(1);

    Message.findById.mockReset();
    Message.findById
      .mockResolvedValueOnce(partiallyDelivered)
      .mockResolvedValueOnce({
        ...initial,
        deliveredTo: [other, third],
      })
      .mockResolvedValueOnce({
        ...initial,
        deliveredTo: [other, third],
        status: 'DELIVERED',
      });

    Message.updateOne.mockReset().mockResolvedValue({ modifiedCount: 1 });

    const finalAck = await markMessageDelivered({
      recipientId: third,
      messageId: String(messageId),
    });

    expect(finalAck.newlyDelivered).toBe(true);
    expect(finalAck.message.status).toBe('DELIVERED');
    expect(finalAck.message.deliveredTo.map(String)).toEqual(
      expect.arrayContaining([String(other), String(third)])
    );
    expect(Message.updateOne).toHaveBeenCalledTimes(2);
  });

  it('rejects an invalid message id', async () => {
    await expect(markMessageDelivered({ recipientId: other, messageId: 'invalid' }))
      .rejects.toMatchObject({ status: 400 });
    expect(Message.findById).not.toHaveBeenCalled();
  });

  it('rejects a user who is not in the conversation', async () => {
    const message = saved();
    Message.findById.mockResolvedValue(message);
    await expect(markMessageDelivered({ recipientId: oid(), messageId: String(message._id) }))
      .rejects.toMatchObject({ code: 'FORBIDDEN_NOT_RECIPIENT' });
    expect(Message.updateOne).not.toHaveBeenCalled();
  });

  it('does not allow the original sender to acknowledge their own message', async () => {
    const message = saved();
    Message.findById.mockResolvedValue(message);
    await expect(markMessageDelivered({ recipientId: sender, messageId: String(message._id) }))
      .rejects.toMatchObject({ code: 'FORBIDDEN_NOT_RECIPIENT' });
    expect(Message.updateOne).not.toHaveBeenCalled();
  });

  it('does not update or notify again for an already delivered message', async () => {
    const message = { ...saved(), status: 'DELIVERED' };
    Message.findById.mockResolvedValue(message);
    await expect(markMessageDelivered({ recipientId: other, messageId: String(message._id) }))
      .resolves.toEqual({ message, newlyDelivered: false });
    expect(Message.updateOne).not.toHaveBeenCalled();
  });

  it('rejects an unknown message', async () => {
    Message.findById.mockResolvedValue(null);
    await expect(markMessageDelivered({ recipientId: other, messageId: String(oid()) }))
      .rejects.toMatchObject({ status: 404 });
  });
});


describe('markMessagesRead (CA-37)', () => {
  it('marks only incoming messages in a conversation as read for a member', async () => {
    const ids = [String(oid()), String(oid())];
    Message.updateMany.mockResolvedValue({ modifiedCount: 2 });
    Message.find.mockReturnValue({
      select: jest.fn().mockResolvedValue(ids.map((_id) => ({
        _id, sender, clientMsgId: 'client-1', status: 'READ',
      }))),
    });

    const result = await markMessagesRead({
      readerId: other, conversationId: String(convId), messageIds: ids,
    });

    expect(Message.updateMany).toHaveBeenCalledWith({
      _id: { $in: ids },
      conversation: convId,
      sender: { $ne: other },
      status: { $in: ['SENT', 'DELIVERED', 'READ'] },
      readBy: { $ne: other },
    }, {
      $set: { status: 'READ' },
      $addToSet: { readBy: other },
    });
    expect(result.newlyRead).toBe(2);
    expect(result.messages).toHaveLength(2);
  });

  it('rejects a non-member and does not update messages', async () => {
    await expect(markMessagesRead({
      readerId: oid(), conversationId: String(convId), messageIds: [String(oid())],
    })).rejects.toMatchObject({ code: 'FORBIDDEN_NOT_MEMBER' });
    expect(Message.updateMany).not.toHaveBeenCalled();
  });

  it('validates conversation and message identifiers', async () => {
    await expect(markMessagesRead({
      readerId: other, conversationId: 'bad', messageIds: ['bad'],
    })).rejects.toMatchObject({ status: 400 });
  });
});
