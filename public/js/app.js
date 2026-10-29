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
  const logoutRequest = api.logout();
  ws.close();
  api.session.clear();
  showAuth('login');

  await logoutRequest;

  if (message) ui.toast('info', message);
}
  $('logout-btn').onclick = () => logout();

  // server told us the token is bad or expired
  ws.on('error', (p) => {
    if (!p) return;
    if (p.code === 'AUTH_FAILED' || p.code === 'AUTH_TOKEN_INVALID') logout('Please log in again');
    else ui.toast('error', p.message);
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
  }

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
  let historyState = {
    conversationId: null,
    hasMore: false,
    nextCursor: null,
    loading: false,
  };
  Chat.names = {}; // userId -> display name (the API returns ids only)

  async function openConversation(c) {
    currentConversation = c;
    historyState = {
      conversationId: c.conversationId,
      hasMore: false,
      nextCursor: null,
      loading: false,
    };
    // the API gives sender ids only; in a private chat the other person is called what the chat is called
    const me = (api.session.user || {}).userId;
    const other = (c.participants || []).find((id) => id !== me);
    if (c.type !== 'GROUP' && other) Chat.names[other] = c.name;
    document.querySelectorAll('.conv').forEach((el) => el.classList.toggle('active', el.dataset.id === c.conversationId));
    $('chat-title').textContent = c.name;
    $('chat-sub').textContent = c.type === 'GROUP' ? 'Group' : '';
    Chat.messages.open(c.conversationId, []);
    $('message-input').disabled = false;
    $('send-btn').disabled = false;
    $('chat-view').dataset.pane = 'chat';
    $('message-input').focus();
    try {
      const res = await api.getMessages(c.conversationId, { limit: 50 });
      if (currentConversation === c && historyState.conversationId === c.conversationId) {
        Chat.messages.open(c.conversationId, res.messages || []);
        historyState.hasMore = Boolean(res.hasMore);
        historyState.nextCursor = res.nextCursor || null;
      }
    } catch (err) {
      ui.toast('error', err.message || 'Could not load message history.');
    }
  }

  async function loadOlderMessages() {
    const state = historyState;
    const conversation = currentConversation;
    if (!conversation || !state.hasMore || !state.nextCursor || state.loading) return;

    state.loading = true;
    try {
      const res = await api.getMessages(conversation.conversationId, {
        limit: 50,
        before: state.nextCursor,
      });
      if (currentConversation !== conversation || historyState !== state) return;
      Chat.messages.prepend(res.messages || []);
      state.hasMore = Boolean(res.hasMore);
      state.nextCursor = res.nextCursor || null;
    } catch (err) {
      ui.toast('error', err.message || 'Could not load older messages.');
    } finally {
      state.loading = false;
    }
  }

  $('message-pane').addEventListener('scroll', () => {
    if ($('message-pane').scrollTop <= 50) void loadOlderMessages();
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
    const user = api.session.user || {};
    const payload = {
      conversationId: currentConversation.conversationId,
      content,
      clientMsgId: (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()),
    };
    // show the message immediately; the server ack (message:status with clientMsgId) updates it
    Chat.messages.add({ ...payload, senderId: user.userId, senderName: 'You', sentAt: new Date().toISOString(), status: 'SENDING' });
    const sent = Chat.mock.enabled ? Chat.mock.send(payload) : ws.send('message:send', payload);
    if (!sent) {
      Chat.messages.markFailed(payload.clientMsgId);
      ui.toast('error', 'Not connected. Message was not sent.');
    }
    input.value = '';
  });

  // Events pushed by the server. Receipt acknowledgements let it stop replaying
  // offline messages after this client has received them.
  ws.on('message:new', (p) => {
    const message = (p && p.message) || p;
    Chat.messages.add(api.normalize.message(message));
    const messageId = message && (message.messageId || message._id);
    if (!Chat.mock.enabled && messageId) ws.send('message:ack', { messageId: String(messageId) });
  });
  ws.on('message:status', (p) => Chat.messages.setStatus(p)); // SENT / DELIVERED / READ ticks
    const presenceUsers = new Map();

  function renderPresence() {
    const list = $('online-list');
    list.replaceChildren();

    const users = Array.from(presenceUsers.values());

    if (!users.length) {
      list.appendChild(emptyItem('No one online'));
      return;
    }

    users.forEach((user) => {
      const li = document.createElement('li');
      li.className = 'conv';

      const name = document.createElement('div');
      name.className = 'conv-name';
      name.textContent = Chat.names[user.userId] || user.userId;

      const status = document.createElement('div');
      status.className = 'conv-last';

      if (user.status === 'online') {
        status.textContent = 'Online';
      } else {
        status.textContent = user.lastSeen
          ? `Last seen: ${new Date(user.lastSeen).toLocaleString()}`
          : 'Offline';
      }

      li.append(name, status);
      list.appendChild(li);
    });
  }

  ws.on('presence:update', (p) => {
    if (!p || !p.userId) return;

    if (p.status === 'online') {
      presenceUsers.set(p.userId, {
        userId: p.userId,
        status: 'online',
        lastSeen: null,
      });
    } else if (p.status === 'offline') {
      presenceUsers.set(p.userId, {
        userId: p.userId,
        status: 'offline',
        lastSeen: p.lastSeen || null,
      });
    }

    renderPresence();
  });


  // TODO CA-38: unread badge for messages in other conversations.
  // TODO CA-39: user search results and "start chat" (REQ-31)

  // ---------- Help / About dialog (Esc closes natively) ----------
  $('about-btn').onclick = () => $('about-dialog').showModal();
  $('about-close').onclick = () => $('about-dialog').close();

  // ---------- start ----------
  if (api.session.token) showChat();
  else showAuth('login');
})(window.Chat);
