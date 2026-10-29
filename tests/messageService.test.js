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
}));

const Conversation = require('../src/models/Conversation');
const Message = require('../src/models/Message');
const {
  sendMessage,
  loadPendingMessagesForRecipient,
  markMessageDelivered,
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
    status: 'SENT',
  });

  it('marks a message delivered only after a valid recipient acknowledges it', async () => {
    const message = saved();
    Message.findById.mockResolvedValue(message);
    Message.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const result = await markMessageDelivered({ recipientId: other, messageId: String(message._id) });

    expect(result).toEqual({ message, newlyDelivered: true });
    expect(Message.updateOne).toHaveBeenCalledWith(
      { _id: message._id, status: 'SENT' },
      { $set: { status: 'DELIVERED' } }
    );
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
