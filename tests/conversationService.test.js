const mongoose = require('mongoose');

jest.mock('../src/models/User', () => ({ findById: jest.fn() }));
jest.mock('../src/models/Conversation', () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  buildParticipantsKey: (ids) => ids.map(String).sort().join('_'),
}));

const User = require('../src/models/User');
const Conversation = require('../src/models/Conversation');
const { getOrCreatePrivateConversation } = require('../src/modules/messaging/conversationService');

const a = new mongoose.Types.ObjectId();
const b = new mongoose.Types.ObjectId();

beforeEach(() => {
  jest.resetAllMocks();
  User.findById.mockImplementation(async (id) => ({ _id: id }));
});

describe('getOrCreatePrivateConversation (CA-21)', () => {
  it('returns the existing conversation without creating one', async () => {
    const existing = { _id: 'c1' };
    Conversation.findOne.mockResolvedValue(existing);
    expect(await getOrCreatePrivateConversation(a, b)).toBe(existing);
    expect(User.findById).toHaveBeenNthCalledWith(1, a);
    expect(User.findById).toHaveBeenNthCalledWith(2, b);
    expect(Conversation.findOne).toHaveBeenCalledWith({
      participantsKey: Conversation.buildParticipantsKey([a, b]),
    });
    expect(Conversation.create).not.toHaveBeenCalled();
  });
  it('creates a conversation when none exists', async () => {
    Conversation.findOne.mockResolvedValue(null);
    Conversation.create.mockResolvedValue({ _id: 'new' });
    expect(await getOrCreatePrivateConversation(a, b)).toEqual({ _id: 'new' });
    expect(Conversation.create).toHaveBeenCalledWith({
      type: 'private',
      participants: [a, b],
    });
    expect(Conversation.create).toHaveBeenCalledTimes(1);
  });
  it('returns the winner when a race triggers a duplicate-key error', async () => {
    Conversation.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ _id: 'winner' });
    Conversation.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));
    expect(await getOrCreatePrivateConversation(a, b)).toEqual({ _id: 'winner' });
  });
  it('rejects the same user twice', async () => {
    await expect(getOrCreatePrivateConversation(a, a)).rejects.toMatchObject({ status: 400 });
  });
  it('rejects a missing user with 404', async () => {
    User.findById.mockResolvedValueOnce({ _id: a }).mockResolvedValueOnce(null);
    await expect(getOrCreatePrivateConversation(a, b)).rejects.toMatchObject({ status: 404 });
  });
});
