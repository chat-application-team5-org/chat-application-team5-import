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
      return [
        { conversationId: 'c1', type: 'PRIVATE', name: 'Bob', lastMessage: 'See you at the demo', unreadCount: 2 },
        { conversationId: 'c2', type: 'GROUP', name: 'Team 5', lastMessage: 'Sprint 1 starts today', unreadCount: 0 },
      ];
    }
    if (method === 'GET' && path.startsWith('/api/users/search')) {
      const q = new URLSearchParams(path.split('?')[1]).get('q').toLowerCase();
      return users.filter((u) => u.username.includes(q));
    }
    throw fail(404, 'NOT_FOUND', 'Not found');
  }

  Chat.mock = { enabled, handle, users };
})(window.Chat);
