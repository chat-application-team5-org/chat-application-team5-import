// Mock backend so the UI can be demoed before the real API exists.
// Enable by opening the app with ?mock in the URL (for example http://localhost:3000/?mock).
// Remove or ignore once CA-11 / CA-17 / CA-21 are merged.
window.Chat = window.Chat || {};
(function (Chat) {
  const enabled = new URLSearchParams(location.search).has('mock');
  const users = [{ userId: 'u2', username: 'bob', displayName: 'Bob' }, { userId: 'u3', username: 'carol', displayName: 'Carol' }];

  function fail(status, code, message) {
    const e = new Error(message); e.status = status; e.code = code; return e;
  }

  async function handle(method, path, body) {
    await new Promise((r) => setTimeout(r, 150));
    if (method === 'POST' && path === '/api/auth/register') {
      if (body.username.toLowerCase() === 'bob') throw fail(409, 'DUPLICATE_USER', 'Username or email is already in use');
      return { userId: 'u1', username: body.username };
    }
    if (method === 'POST' && path === '/api/auth/login') {
      if (body.password !== 'Password1') throw fail(401, 'AUTH_INVALID_CREDENTIALS', 'Invalid credentials');
      return { token: 'mock-token', expiresIn: 86400, user: { userId: 'u1', username: body.identifier, displayName: body.identifier } };
    }
    if (method === 'GET' && path === '/api/conversations') {
      // same shape as the real GET /api/conversations: { conversations: [documents] }
      return { conversations: [
        { _id: 'c1', type: 'PRIVATE', name: 'Bob', participants: ['u1', 'u2'], lastMessage: 'See you at the demo', unreadCount: 2 },
        { _id: 'c2', type: 'GROUP', name: 'Team 5', participants: ['u1', 'u2', 'u3'], lastMessage: 'Sprint 1 starts today', unreadCount: 0 },
      ] };
    }
    if (method === 'GET' && path.startsWith('/api/users/search')) {
      const q = new URLSearchParams(path.split('?')[1]).get('q').toLowerCase();
      return users.filter((u) => u.username.includes(q));
    }
    const m = path.match(/^\/api\/conversations\/([^/]+)\/messages/);
    if (method === 'GET' && m) return { messages: sampleMessages(m[1]), hasMore: false };
    throw fail(404, 'NOT_FOUND', 'Not found');
  }

  function minutesAgo(n) { return new Date(Date.now() - n * 60000).toISOString(); }

  // Same shape as the real GET /api/conversations/:id/messages (Mongoose documents).
  function sampleMessages(conversationId) {
    const doc = (id, sender, content, minutes, status) => ({ _id: id, conversation: conversationId, sender, content, status, createdAt: minutesAgo(minutes) });
    if (conversationId === 'c1') {
      return [
        doc('m1', 'u2', 'Hey! Did you push the skeleton?', 50, 'READ'),
        doc('m2', 'u1', 'Yes, CA-12 is merged.', 48, 'READ'),
        doc('m3', 'u2', 'Great. See you at the demo', 46, 'READ'),
        doc('m4', 'u1', 'Sprint 1 review tomorrow.\nBring the board screenshots.', 10, 'DELIVERED'),
      ];
    }
    return [];
  }

  // Simulates the server: SENT, DELIVERED, READ acks and a reply (for demoing CA-25 without a backend).
  // Events have the same shape as the real gateway.js: the SENT ack carries clientMsgId and messageId
  // (no timestamp); later status events carry messageId only; message:new wraps the document in { message }.
  function send(payload) {
    const messageId = 'srv-' + Date.now();
    const at = (ms, fn) => setTimeout(fn, ms);
    at(300, () => Chat.ws.inject('message:status', { clientMsgId: payload.clientMsgId, messageId, status: 'SENT' }));
    at(900, () => Chat.ws.inject('message:status', { messageId, status: 'DELIVERED' }));
    at(1600, () => Chat.ws.inject('message:status', { messageId, status: 'READ' }));
    at(2200, () => Chat.ws.inject('message:new', { message: {
      _id: 'srv-r-' + Date.now(), conversation: payload.conversationId, sender: 'u2',
      content: 'Got it!', status: 'SENT', createdAt: new Date().toISOString(),
    } }));
    return true;
  }

  Chat.mock = { enabled, handle, users, send };
})(window.Chat);
