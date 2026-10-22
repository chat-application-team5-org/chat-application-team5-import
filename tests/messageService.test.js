const mongoose = require('mongoose');

jest.mock('../src/models/Conversation', () => ({ findById: jest.fn() }));
jest.mock('../src/models/Message', () => ({ create: jest.fn() }));

const Conversation = require('../src/models/Conversation');
const Message = require('../src/models/Message');
const { sendMessage } = require('../src/modules/messaging/messageService');

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
