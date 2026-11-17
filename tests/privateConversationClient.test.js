const fs = require('fs');
const vm = require('vm');

function loadApi(fetch) {
  const values = new Map([
    ['chat.token', 'test-token'],
    ['chat.user', JSON.stringify({ userId: '64b7f0c2a1b2c3d4e5f60718' })],
  ]);
  const sessionStorage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const window = { Chat: { mock: { enabled: false } } };
  vm.runInContext(fs.readFileSync('public/js/api.js', 'utf8'), vm.createContext({
    window,
    sessionStorage,
    fetch,
    URLSearchParams,
  }));
  return window.Chat.api;
}

describe('private conversation client flow (CA-21 / CA-39)', () => {
  it('posts the searched userId as participantId with the session bearer token', async () => {
    const fetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        conversation: {
          _id: '64b7f0c2a1b2c3d4e5f60720',
          type: 'private',
          participants: [
            '64b7f0c2a1b2c3d4e5f60718',
            '64b7f0c2a1b2c3d4e5f60719',
          ],
        },
        messages: [],
      }),
    });
    const api = loadApi(fetch);

    const result = await api.createPrivateConversation('64b7f0c2a1b2c3d4e5f60719');

    expect(fetch).toHaveBeenCalledWith('/api/conversations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({ participantId: '64b7f0c2a1b2c3d4e5f60719' }),
    });
    expect(result.conversation).toMatchObject({
      conversationId: '64b7f0c2a1b2c3d4e5f60720',
      type: 'private',
      participants: [
        '64b7f0c2a1b2c3d4e5f60718',
        '64b7f0c2a1b2c3d4e5f60719',
      ],
    });
  });
});
