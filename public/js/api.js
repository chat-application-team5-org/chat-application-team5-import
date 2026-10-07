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

  Chat.api = {
    session,
    register: (username, email, password) => request('POST', '/api/auth/register', { username, email, password }),
    login: (identifier, password) => request('POST', '/api/auth/login', { identifier, password }),
    logout: () => request('POST', '/api/auth/logout').catch(() => null),
    searchUsers: (q) => request('GET', '/api/users/search?q=' + encodeURIComponent(q)),
    listConversations: () => request('GET', '/api/conversations'),
  };
})(window.Chat);
