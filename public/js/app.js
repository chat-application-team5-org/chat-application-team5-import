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
    $('online-list').replaceChildren(emptyItem('No one online'));
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

  function openConversation(c) {
    currentConversation = c;
    document.querySelectorAll('.conv').forEach((el) => el.classList.toggle('active', el.dataset.id === c.conversationId));
    $('chat-title').textContent = c.name;
    $('chat-sub').textContent = c.type === 'GROUP' ? 'Group' : '';
    $('message-pane').replaceChildren();
    const p = document.createElement('p'); p.className = 'empty';
    p.textContent = 'Messages will appear here.'; // TODO CA-25: render messages (sender, time, status)
    $('message-pane').appendChild(p);
    $('message-input').disabled = false;
    $('send-btn').disabled = false;
    $('chat-view').dataset.pane = 'chat';
    $('message-input').focus();
  }

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
    // TODO CA-22 / CA-25: server ack and rendering. For now the event is sent over the socket.
    ws.send('message:send', {
      conversationId: currentConversation.conversationId,
      content,
      clientMsgId: (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()),
    });
    input.value = '';
  });

  // TODO CA-39: user search results and "start chat" (REQ-31)

  // ---------- Help / About dialog (Esc closes natively) ----------
  $('about-btn').onclick = () => $('about-dialog').showModal();
  $('about-close').onclick = () => $('about-dialog').close();

  // ---------- start ----------
  if (api.session.token) showChat();
  else showAuth('login');
})(window.Chat);
