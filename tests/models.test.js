const mongoose = require('mongoose');
const User = require('../src/models/User');
const Conversation = require('../src/models/Conversation');
const Message = require('../src/models/Message');

const id = () => new mongoose.Types.ObjectId();

// Resolves to the validation error, or undefined when the document is valid.
const check = (doc) => doc.validate().then(() => undefined, (err) => err);

describe('User model (CA-14)', () => {
  it('accepts a valid user', async () => {
    const u = new User({ username: 'Alice', email: 'A@Example.com', passwordHash: 'hash' });
    expect((await check(u))).toBeUndefined();
    expect(u.username).toBe('alice');
    expect(u.email).toBe('a@example.com');
  });
  it('rejects missing fields', async () => {
    const err = (await check(new User({})));
    expect(Object.keys(err.errors)).toEqual(expect.arrayContaining(['username', 'email', 'passwordHash']));
  });
  it('declares unique indexes on username and email', async () => {
    const indexes = User.schema.indexes().map(([fields]) => Object.keys(fields)[0]);
    expect(indexes).toEqual(expect.arrayContaining(['username', 'email']));
  });
});

describe('Conversation model (CA-14)', () => {
  it('builds the same key regardless of participant order', async () => {
    const a = id();
    const b = id();
    const c1 = new Conversation({ participants: [a, b] });
    const c2 = new Conversation({ participants: [b, a] });
    (await check(c1));
    (await check(c2));
    expect(c1.participantsKey).toBe(c2.participantsKey);
  });
  it('rejects fewer than two participants', async () => {
    expect((await check(new Conversation({ participants: [id()] })))).toBeDefined();
  });
  it('rejects duplicate participants', async () => {
    const a = id();
    expect((await check(new Conversation({ participants: [a, a] })))).toBeDefined();
  });
  it('rejects a private chat with three participants', async () => {
    expect((await check(new Conversation({ participants: [id(), id(), id()] })))).toBeDefined();
  });
  it('has a unique index on participantsKey', async () => {
    const found = Conversation.schema.indexes().find(([f]) => f.participantsKey);
    expect(found[1].unique).toBe(true);
  });
});

describe('Message model (CA-14)', () => {
  const base = { conversation: id(), sender: id() };
  it('accepts a valid message and defaults status to SENT', async () => {
    const m = new Message({ ...base, content: 'Hi' });
    expect((await check(m))).toBeUndefined();
    expect(m.status).toBe('SENT');
  });
  it('rejects blank content', async () => {
    expect((await check(new Message({ ...base, content: '   ' })))).toBeDefined();
  });
  it('rejects content over 2000 characters', async () => {
    expect((await check(new Message({ ...base, content: 'a'.repeat(2001) })))).toBeDefined();
  });
  it('rejects a missing sender', async () => {
    expect((await check(new Message({ conversation: id(), content: 'Hi' })))).toBeDefined();
  });
});
