// Wires the screens together: register/login, Chat Home shell, logout.
(function (Chat) {
  const $ = (id) => document.getElementById(id);
  const { ui, api, ws } = Chat;

  // ---------- views ----------
  function showAuth(tab) {
    $('auth-view').hidden = false;
    $('chat-view').hidden = true;
    $('logout-btn').hidden = true;
    const login = tab !== 'register';
    $('login-form').hidden = !login;
    $('register-form').hidden = login;
    $('tab-login').classList.toggle('active', login);
    $('tab-register').classList.toggle('active', !login);
    $('tab-login').setAttribute('aria-selected', String(login));
    $('tab-register').setAttribute('aria-selected', String(!login));
    (login ? $('login-identifier') : $('reg-username')).focus();
  }

  function showChat() {
    $('auth-view').hidden = true;
    $('chat-view').hidden = false;
    $('logout-btn').hidden = false;
    $('chat-view').dataset.pane = 'list';
    loadConversations();
    if (Chat.mock.enabled) setConn('online');
    else ws.connect(api.session.token);
  }

  function setConn(state) {
    const labels = { online: 'Connected', connecting: 'Connecting...', offline: 'Offline' };
    $('conn-status').dataset.state = state;
    $('conn-text').textContent = labels[state] || state;
    $('conn-status').title = labels[state] || state;
  }
  ws.onStatus(setConn);

  // ---------- auth forms ----------
  $('tab-login').onclick = () => showAuth('login');
  $('tab-register').onclick = () => showAuth('register');
  $('to-register').onclick = (e) => { e.preventDefault(); showAuth('register'); };
  $('to-login').onclick = (e) => { e.preventDefault(); showAuth('login'); };

  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('login-identifier'), pw = $('login-password');
    const idErr = ui.validate.required(id.value, 'Username or email');
    const pwErr = ui.validate.required(pw.value, 'Password');
    ui.setFieldError(id, idErr); ui.setFieldError(pw, pwErr);
    if (idErr || pwErr) return;
    try {
      const res = await api.login(id.value.trim(), pw.value);
      api.session.save(res.token, res.user);
      pw.value = '';
      showChat();
    } catch (err) {
      // generic message for bad credentials (REQ-5); other errors show the server text
      ui.toast('error', err.message);
    }
  });

  $('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = $('reg-username'), em = $('reg-email'), pw = $('reg-password');
    const errs = [ui.validate.username(u.value), ui.validate.email(em.value), ui.validate.password(pw.value)];
    ui.setFieldError(u, errs[0]); ui.setFieldError(em, errs[1]); ui.setFieldError(pw, errs[2]);
    if (errs.some(Boolean)) return;
    try {
      await api.register(u.value.trim(), em.value.trim(), pw.value);
      ui.toast('success', 'Account created. Please log in.');
      $('login-identifier').value = u.value.trim();
      pw.value = '';
      showAuth('login');
    } catch (err) {
      ui.toast('error', err.message);
    }
  });

  // ---------- logout ----------
  async function logout(message) {
    await api.logout();
    ws.close();
    api.session.clear();
    if (message) ui.toast('info', message);
    showAuth('login');
  }
  $('logout-btn').onclick = () => logout();

  // server told us the token is bad or expired
  ws.on('error', (p) => {
    if (!p) return;
    if (p.code === 'AUTH_FAILED' || p.code === 'AUTH_TOKEN_INVALID') logout('Please log in again');
    else {
      const pending = pendingMessages.get(p.clientMsgId);
      if (pending) {
        pending.bubble.remove();
        pendingMessages.delete(p.clientMsgId);
        if (!$('message-input').value) $('message-input').value = pending.content;
      }
      ui.toast('error', p.message);
    }
  });

  // ---------- Chat Home shell ----------
  function emptyItem(text) {
    const li = document.createElement('li');
    li.className = 'empty-item';
    li.textContent = text;
    return li;
  }

  async function loadConversations() {
    const list = $('conversation-list');
    list.replaceChildren();
    try {
      const convs = await api.listConversations();
      if (!convs.length) return list.appendChild(emptyItem('No conversations yet'));
      convs.forEach((c) => list.appendChild(convItem(c)));
    } catch {
      // The conversations endpoint arrives with CA-21; keep the shell usable until then.
      list.appendChild(emptyItem('No conversations yet'));
    }
    $('online-list').replaceChildren(emptyItem('No one online'));
  }

  const searchInput = $('search-input');
  const searchResults = $('search-results');
  let searchTimer;
  let searchRequestId = 0;

  function showSearchMessage(message) {
    searchResults.replaceChildren(emptyItem(message));
    searchResults.hidden = false;
  }

  async function startPrivateConversation(user) {
    try {
      const result = await api.createConversation(user.userId);
      const conversation = result && result.conversation;
      const conversationId = conversation && (conversation._id || conversation.conversationId);
      if (!conversationId) throw new Error('Could not open this conversation.');

      searchInput.value = '';
      searchResults.replaceChildren();
      searchResults.hidden = true;
      searchRequestId += 1;
      await loadConversations();
      await openConversation({
        conversationId: String(conversationId),
        name: user.displayName || user.username,
        type: 'PRIVATE',
      });
    } catch (error) {
      ui.toast('error', error.message);
    }
  }

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const query = searchInput.value.trim();
    const requestId = ++searchRequestId;
    searchResults.replaceChildren();
    if (!query) {
      searchResults.hidden = true;
      return;
    }

    showSearchMessage('Searching…');
    searchTimer = setTimeout(async () => {
      try {
        const users = await api.searchUsers(query);
        if (requestId !== searchRequestId) return;
        searchResults.replaceChildren();
        if (!users.length) return showSearchMessage('No users found');

        users.forEach((user) => {
          const item = document.createElement('li');
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'search-result';
          button.textContent = user.displayName || user.username;
          button.addEventListener('click', () => startPrivateConversation(user));
          item.appendChild(button);
          searchResults.appendChild(item);
        });
        searchResults.hidden = false;
      } catch (error) {
        if (requestId === searchRequestId) showSearchMessage(error.message);
      }
    }, 200);
  });

  function convItem(c) {
    const li = document.createElement('li');
    li.className = 'conv';
    li.tabIndex = 0;
    li.dataset.id = c.conversationId;
    const left = document.createElement('div');
    const name = document.createElement('div'); name.className = 'conv-name'; name.textContent = c.name;
    const last = document.createElement('div'); last.className = 'conv-last'; last.textContent = c.lastMessage || '';
    left.append(name, last);
    li.appendChild(left);
    if (c.unreadCount) {
      const b = document.createElement('span'); b.className = 'badge'; b.textContent = c.unreadCount;
      li.appendChild(b);
    }
    const open = () => openConversation(c);
    li.onclick = open;
    li.onkeydown = (e) => { if (e.key === 'Enter') open(); };
    return li;
  }

  let currentConversation = null;
  let messageHistory = {
    conversationId: null,
    nextCursor: null,
    hasMore: false,
    loading: false,
  };

  async function openConversation(c) {
    currentConversation = c;
    messageHistory = {
      conversationId: String(c.conversationId),
      nextCursor: null,
      hasMore: false,
      loading: true,
    };
    document.querySelectorAll('.conv').forEach((el) => el.classList.toggle('active', el.dataset.id === c.conversationId));
    $('chat-title').textContent = c.name;
    $('chat-sub').textContent = c.type === 'GROUP' ? 'Group' : '';
    $('message-pane').replaceChildren();
    const loading = document.createElement('p'); loading.className = 'empty'; loading.textContent = 'Loading messages…';
    $('message-pane').appendChild(loading);
    $('message-input').disabled = false;
    $('send-btn').disabled = false;
    $('chat-view').dataset.pane = 'chat';
    try {
      const page = await api.getMessages(c.conversationId, { limit: 50 });
      if (currentConversation !== c) return;
      messageHistory.nextCursor = page.nextCursor;
      messageHistory.hasMore = page.hasMore;
      messageHistory.loading = false;
      $('message-pane').replaceChildren();
      if (!page.messages.length) {
        const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'No messages yet.';
        $('message-pane').appendChild(empty);
      } else page.messages.forEach((message) => renderMessage(message));
    } catch (err) {
      $('message-pane').replaceChildren();
      ui.toast('error', err.message);
    }
    $('message-input').focus();
  }

  // Load older pages as the user scrolls to the top of the conversation.
  async function loadOlderMessages() {
    const state = messageHistory;
    const pane = $('message-pane');
    if (!state.conversationId || !state.hasMore || state.loading || !state.nextCursor) return;

    state.loading = true;
    const previousHeight = pane.scrollHeight;
    const previousTop = pane.scrollTop;
    try {
      const page = await api.getMessages(state.conversationId, {
        limit: 50,
        before: state.nextCursor,
      });
      if (messageHistory !== state) return;

      // Insert in reverse because each prepended bubble goes before the first one.
      page.messages.slice().reverse().forEach((message) => renderMessage(message, { prepend: true }));
      state.hasMore = page.hasMore;
      state.nextCursor = page.nextCursor;
      pane.scrollTop = previousTop + (pane.scrollHeight - previousHeight);
    } catch (error) {
      ui.toast('error', 'Could not load older messages: ' + error.message);
    } finally {
      if (messageHistory === state) state.loading = false;
    }
  }

  $('message-pane').addEventListener('scroll', () => {
    if ($('message-pane').scrollTop <= 40) loadOlderMessages();
  });

  const pendingMessages = new Map();
  function renderMessage(message, { pending = false, clientMsgId, prepend = false } = {}) {
    const pane = $('message-pane');
    const empty = pane.querySelector('.empty');
    if (empty) empty.remove();
    const senderId = message.sender && (message.sender._id || message.sender);
    const own = String(senderId) === String(api.session.user && api.session.user.userId);
    const bubble = document.createElement('article');
    bubble.className = 'message' + (own ? ' message-own' : '') + (pending ? ' message-pending' : '');
    if (clientMsgId) bubble.dataset.clientMsgId = clientMsgId;
    const content = document.createElement('div'); content.textContent = message.content;
    const meta = document.createElement('div'); meta.className = 'message-meta';
    const sender = document.createElement('span');
    sender.textContent = own ? 'You' : ((message.sender && message.sender.username) || 'Other user');
    const time = document.createElement('time');
    const date = new Date(message.createdAt || Date.now());
    time.dateTime = date.toISOString();
    time.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const status = document.createElement('span'); status.className = 'message-status';
    status.textContent = message.status || (pending ? 'Sending…' : 'SENT');
    meta.append(sender, time, status);
    bubble.append(content, meta);
    if (prepend) pane.insertBefore(bubble, pane.firstChild);
    else {
      pane.appendChild(bubble);
      pane.scrollTop = pane.scrollHeight;
    }
    return bubble;
  }

  ws.on('message:status', (payload) => {
    const pending = pendingMessages.get(payload.clientMsgId);
    if (!pending) return;
    pending.bubble.classList.remove('message-pending');
    pending.bubble.querySelector('.message-status').textContent = payload.status;
    pendingMessages.delete(payload.clientMsgId);
  });

  ws.on('message:new', (payload) => {
    const message = payload && payload.message;
    if (!message || !currentConversation) return;
    const conversationId = String(message.conversation && (message.conversation._id || message.conversation));
    if (conversationId === String(currentConversation.conversationId)) renderMessage(message);
  });

  $('back-btn').onclick = () => { $('chat-view').dataset.pane = 'list'; };

  // Enter sends, Shift+Enter inserts a new line
  $('message-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      $('message-form').requestSubmit();
    }
  });

  $('message-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('message-input');
    const content = input.value;
    if (!content.trim()) return ui.toast('error', 'Message cannot be empty');
    if (content.length > 2000) return ui.toast('error', 'Message is too long (maximum 2,000 characters)');
    if (!currentConversation) return;
    const clientMsgId = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now());
    const sent = ws.send('message:send', {
      conversationId: currentConversation.conversationId,
      content,
      clientMsgId,
    });
    if (!sent) return ui.toast('error', 'The chat connection is not ready. Your message is still here.');
    const bubble = renderMessage({
      content,
      createdAt: new Date().toISOString(),
      status: 'Sending…',
      sender: api.session.user && api.session.user.userId,
    }, { pending: true, clientMsgId });
    pendingMessages.set(clientMsgId, { bubble, content });
    input.value = '';
  });

  // Search results use the authenticated users endpoint and open private chats.

  // ---------- Help / About dialog (Esc closes natively) ----------
  $('about-btn').onclick = () => $('about-dialog').showModal();
  $('about-close').onclick = () => $('about-dialog').close();

  // ---------- start ----------
  if (api.session.token) showChat();
  else showAuth('login');
})(window.Chat);
