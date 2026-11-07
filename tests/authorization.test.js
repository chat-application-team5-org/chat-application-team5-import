const { assertConversationMember } = require('../src/modules/messaging/authorization');

describe('conversation membership (CA-31)', () => {
  test('rejects missing records and missing identities', () => {
    expect(() => assertConversationMember(null, 'a')).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
    expect(() => assertConversationMember({ participants: ['a'] }, null)).toThrow(expect.objectContaining({ code: 'FORBIDDEN_NOT_MEMBER' }));
  });
  test('accepts current members and rejects outsiders or removed members', () => {
    const conversation = { participants: ['a', 'b'] };
    expect(assertConversationMember(conversation, 'b')).toBe(conversation);
    expect(() => assertConversationMember(conversation, 'c')).toThrow(expect.objectContaining({ code: 'FORBIDDEN_NOT_MEMBER' }));
    conversation.participants = ['a'];
    expect(() => assertConversationMember(conversation, 'b')).toThrow(expect.objectContaining({ code: 'FORBIDDEN_NOT_MEMBER' }));
  });
});
