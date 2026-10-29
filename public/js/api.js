// REST client. Sends the JWT in the Authorization header and turns the standard
// error format { error: { code, message } } (SAD 4.4) into thrown errors.
window.Chat = window.Chat || {};
(function (Chat) {
  const TOKEN_KEY = 'chat.token';
  const USER_KEY = 'chat.user';

  // sessionStorage: cleared when the tab closes (the token is never put in a URL).
  const session = {
    get token() { return sessionStorage.getItem(TOKEN_KEY); },
    get user() {
      try { return JSON.parse(sessionStorage.getItem(USER_KEY)); } catch { return null; }
    },
    save(token, user) {
      sessionStorage.setItem(TOKEN_KEY, token);
      sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    },
    clear() {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
    },
  };

  function apiError(code, message, status) {
    const e = new Error(message); e.code = code; e.status = status; return e;
  }

  async function request(method, path, body) {
    if (Chat.mock.enabled) return Chat.mock.handle(method, path, body);
    const headers = { 'Content-Type': 'application/json' };
    if (session.token) headers.Authorization = 'Bearer ' + session.token;
    let res;
    try {
      res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    } catch {
      throw apiError('NETWORK_ERROR', 'Cannot reach the server', 0);
    }
    if (res.status === 204) return null;
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON body */ }
    if (!res.ok) {
      const err = (data && data.error) || {};
      throw apiError(err.code || 'INTERNAL_ERROR', err.message || 'Something went wrong, please try again', res.status);
    }
    return data;
  }

  // The backend returns Mongoose documents ({ _id, conversation, sender, createdAt, ... }).
  // The UI works with flat objects, so everything is converted here, in one place.
  const idOf = (v) => (v && typeof v === 'object' && v._id ? String(v._id) : v == null ? v : String(v));

  function normalizeMessage(m) {
    return {
      messageId: m.messageId || idOf(m._id),
      conversationId: m.conversationId || idOf(m.conversation),
      senderId: m.senderId || idOf(m.sender),
      senderName: m.senderName || (m.sender && m.sender.displayName) || (m.sender && m.sender.username) || '',
      content: m.content,
      sentAt: m.sentAt || m.createdAt,
      status: m.status,
      clientMsgId: m.clientMsgId,
    };
  }

  function normalizeConversation(c) {
    const participants = (c.participants || []).map(idOf);
    return {
      conversationId: c.conversationId || idOf(c._id),
      type: c.type || (participants.length > 2 ? 'GROUP' : 'PRIVATE'),
      name: c.name || c.title || (c.otherUser && (c.otherUser.displayName || c.otherUser.username)) || 'Conversation',
      lastMessage: c.lastMessage || '',
      unreadCount: c.unreadCount || 0,
      participants,
    };
  }

  Chat.api = {
    session,
    register: (username, email, password) => request('POST', '/api/auth/register', { username, email, password }),
    login: (identifier, password) => request('POST', '/api/auth/login', { identifier, password }),
    logout: () => request('POST', '/api/auth/logout').catch(() => null),
    searchUsers: (q) => request('GET', '/api/users/search?q=' + encodeURIComponent(q)),
    // accepts either an array or { conversations: [...] }
    listConversations: async () => {
      const res = await request('GET', '/api/conversations');
      return (Array.isArray(res) ? res : (res && res.conversations) || []).map(normalizeConversation);
    },
    // Message history supports the latest page, older pages, and missed-message sync.
    getMessages: async (conversationId, options = {}) => {
      const params = new URLSearchParams();
      ['limit', 'before', 'after'].forEach((key) => {
        if (options[key] !== undefined && options[key] !== null) params.set(key, String(options[key]));
      });
      const query = params.toString();
      const path = '/api/conversations/' + encodeURIComponent(conversationId) + '/messages'
        + (query ? '?' + query : '');
      const res = await request('GET', path);
      return {
        messages: ((res && res.messages) || []).map(normalizeMessage),
        hasMore: Boolean(res && res.hasMore),
        nextCursor: (res && res.nextCursor) || null,
      };
    },
    normalize: { message: normalizeMessage, conversation: normalizeConversation },
  };
})(window.Chat);
