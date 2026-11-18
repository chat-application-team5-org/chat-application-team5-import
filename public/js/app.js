// Wires the screens together: register/login, Chat Home shell, logout.
(function (Chat) {
  const $ = (id) => document.getElementById(id);
  const { ui, api, ws } = Chat;
  let readAcks = null;
  let readAckUserId = null;

  function ensureReadAckQueue() {
    const userId = (api.session.user || {}).userId || 'anonymous';
    if (readAcks && readAckUserId === userId) return readAcks;
    if (readAcks) readAcks.pause();
    readAckUserId = userId;
    readAcks = Chat.readAcks.create(
      (conversationId, lastReadMessageId) => ws.send('message:read', { conversationId, lastReadMessageId }),
      { storageKey: `chat.read-acknowledgements.${userId}.v1` }
    );
    return readAcks;
  }

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
    ensureReadAckQueue();
    $('auth-view').hidden = true;
    $('chat-view').hidden = false;
    $('logout-btn').hidden = false;
    $('chat-view').dataset.pane = 'list';
    loadConversations();

    if (Chat.mock.enabled) setConn('online');
    else ws.connect(api.session.token);
  }

  function setConn(state) {
    const labels = {
      online: 'Connected',
      connecting: 'Connecting...',
      reconnecting: 'Reconnecting...',
      offline: 'Offline',
    };

    $('conn-status').dataset.state = state;
    $('conn-text').textContent = labels[state] || state;
    $('conn-status').title = labels[state] || state;
  }

  ws.onStatus(setConn);

  // ---------- auth forms ----------
  $('tab-login').onclick = () => showAuth('login');
  $('tab-register').onclick = () => showAuth('register');

  $('to-register').onclick = (e) => {
    e.preventDefault();
    showAuth('register');
  };

  $('to-login').onclick = (e) => {
    e.preventDefault();
    showAuth('login');
  };

  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = $('login-identifier');
    const pw = $('login-password');
    const idErr = ui.validate.required(id.value, 'Username or email');
    const pwErr = ui.validate.required(pw.value, 'Password');

    ui.setFieldError(id, idErr);
    ui.setFieldError(pw, pwErr);

    if (idErr || pwErr) return;

    try {
      const res = await api.login(id.value.trim(), pw.value);
      api.session.save(res.token, res.user);
      pw.value = '';
      showChat();
    } catch (err) {
      ui.toast('error', err.message);
    }
  });

  $('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const u = $('reg-username');
    const em = $('reg-email');
    const pw = $('reg-password');

    const errs = [
      ui.validate.username(u.value),
      ui.validate.email(em.value),
      ui.validate.password(pw.value),
    ];

    ui.setFieldError(u, errs[0]);
    ui.setFieldError(em, errs[1]);
    ui.setFieldError(pw, errs[2]);

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
    if (readAcks) readAcks.pause();
    api.session.clear();
    showAuth('login');

    await logoutRequest;

    if (message) ui.toast('info', message);
  }

  $('logout-btn').onclick = () => logout();

  // Server told us the token is bad or expired.
  ws.on('error', (p) => {
    if (!p) return;

    if (p.code === 'AUTH_FAILED' || p.code === 'AUTH_TOKEN_INVALID') {
      logout('Please log in again');
    } else {
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

  let conversationCache = [];
  let conversationLoadId = 0;
  function renderConversationList(conversations) {
    const list = $('conversation-list');
    list.replaceChildren();
    if (!conversations.length) {
      list.appendChild(emptyItem('No conversations yet'));
      return;
    }
    conversations.forEach((conversation) => list.appendChild(convItem(conversation)));
  }

  async function loadConversations() {
    const loadId = ++conversationLoadId;

    try {
      const convs = await api.listConversations();
      if (loadId !== conversationLoadId) return;

      conversationCache = convs;
      Chat.unread.updateTitleFromConversations(conversationCache);

      if (!$('search-input').value.trim()) renderConversationList(conversationCache);
    } catch {
      if (loadId === conversationLoadId && !$('search-input').value.trim()) {
        $('conversation-list').replaceChildren(emptyItem('No conversations yet'));
      }
    }
  }

  const unreadRefresh = Chat.unread.createRefreshScheduler(() => {
    void loadConversations();
  });

  function setConversationUnreadCount(conversationId, unreadCount) {
    conversationCache = conversationCache.map((conversation) => (
      conversation.conversationId === conversationId
        ? { ...conversation, unreadCount }
        : conversation
    ));
    Chat.unread.updateTitleFromConversations(conversationCache);
    if (!$('search-input').value.trim()) renderConversationList(conversationCache);
  }

  function convItem(c) {
    const li = document.createElement('li');
    li.className = 'conv';
    li.tabIndex = 0;
    li.dataset.id = c.conversationId;

    const left = document.createElement('div');

    const name = document.createElement('div');
    name.className = 'conv-name';
    name.textContent = c.name;

    const last = document.createElement('div');
    last.className = 'conv-last';
    last.textContent = c.lastMessage || '';

    left.append(name, last);
    li.appendChild(left);

    if (c.unreadCount) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = c.unreadCount;
      li.appendChild(badge);
    }

    const open = () => openConversation(c);

    li.onclick = open;

    li.onkeydown = (e) => {
      if (e.key === 'Enter') open();
    };

    return li;
  }

  let currentConversation = null;
  let lastTypingSentAt = 0;
  let remoteTypingTimeout = null;

  let historyState = {
    conversationId: null,
    hasMore: false,
    nextCursor: null,
    loading: false,
  };

  Chat.names = {};

  function isCurrentConversationOpen(conversationId) {
    return Boolean(
      currentConversation &&
      $('chat-view').dataset.pane === 'chat' &&
      (!conversationId || currentConversation.conversationId === conversationId)
    );
  }

  function acknowledgeRead(messages, conversationId) {
    if (Chat.mock.enabled || !Array.isArray(messages)) return;
    const userId = (api.session.user || {}).userId;
    const messageIds = messages
      .filter((message) => message.senderId !== userId && message.messageId)
      .map((message) => String(message.messageId));

    if (messageIds.length) {
      ws.send('message:read', { conversationId, messageIds });
    }
  }

  function acknowledgeConversationRead(conversationId, messages) {
    if (Chat.mock.enabled || !Array.isArray(messages) || !messages.length) return;
    const latestMessageId = messages[messages.length - 1].messageId;
    if (!latestMessageId) return;
    ensureReadAckQueue().queue(conversationId, String(latestMessageId));
  }

  async function openConversation(c) {
    if (currentConversation && currentConversation.conversationId !== c.conversationId) {
      closeGroupInfo();
    }
    if (remoteTypingTimeout) {
      clearTimeout(remoteTypingTimeout);
      remoteTypingTimeout = null;
    }

    $('typing-indicator').textContent = '';
    currentConversation = c;
    c.unreadCount = 0;
    setConversationUnreadCount(c.conversationId, 0);
    acknowledgeConversationRead(c.conversationId);

    historyState = {
      conversationId: c.conversationId,
      hasMore: false,
      nextCursor: null,
      loading: false,
    };

    const me = (api.session.user || {}).userId;
    const other = (c.participants || []).find((id) => id !== me);

    if (c.type !== 'GROUP' && other) {
      Chat.names[other] = c.name;
    }

    document.querySelectorAll('.conv').forEach((el) => {
      el.classList.toggle(
        'active',
        el.dataset.id === c.conversationId
      );
    });

    $('chat-title').textContent = c.name;
    $('chat-sub').textContent = c.type === 'GROUP' ? 'Group' : '';
    $('group-info-btn').hidden = c.type !== 'GROUP';

    Chat.messages.open(c.conversationId, []);

    $('message-input').disabled = false;
    $('send-btn').disabled = false;
    $('chat-view').dataset.pane = 'chat';
    $('message-input').focus();

    try {
      const res = await api.getMessages(c.conversationId, {
        limit: 50,
      });

      if (
        currentConversation === c &&
        historyState.conversationId === c.conversationId
      ) {
        Chat.messages.open(
          c.conversationId,
          res.messages || []
        );
        acknowledgeConversationRead(c.conversationId, res.messages || []);

        historyState.hasMore = Boolean(res.hasMore);
        historyState.nextCursor = res.nextCursor || null;
      }
    } catch (err) {
      ui.toast(
        'error',
        err.message || 'Could not load message history.'
      );
    }
  }


  // ---------- Group information and administration (CA-32) ----------
  let groupInfoState = null;
  let groupInfoRequestId = 0;
  let groupSearchTimer = null;
  let groupSearchRequestId = 0;

  function setGroupInfoFeedback(message, isError = false) {
    const feedback = $('group-info-feedback');
    feedback.textContent = message || '';
    feedback.dataset.state = isError ? 'error' : 'info';
  }

  function renderGroupInfo(details) {
    groupInfoState = details;
    $('group-info-title').textContent = details.name;
    $('group-info-description').textContent =
      `${details.members.length} members · Created by ${details.members.find((member) => member.userId === details.createdBy)?.displayName || 'a member'}`;

    const me = String((api.session.user || {}).userId || '');
    const isAdmin = details.members.some(
      (member) => member.userId === me && member.role === 'ADMIN'
    );
    $('group-admin-controls').hidden = !isAdmin;
    $('group-rename-input').value = details.name;
    $('group-leave-btn').hidden = !details.members.some((member) => member.userId === me);
    $('group-add-search').value = '';
    $('group-add-results').replaceChildren();

    const list = $('group-member-list');
    list.replaceChildren();
    details.members.forEach((member) => {
      const item = document.createElement('li');
      item.className = 'group-member-row';

      const identity = document.createElement('div');
      identity.className = 'group-member-identity';
      const displayName = document.createElement('strong');
      displayName.textContent = member.displayName || member.username;
      const username = document.createElement('span');
      username.className = 'group-member-username';
      username.textContent = '@' + member.username;
      identity.append(displayName, username);

      const actions = document.createElement('div');
      actions.className = 'group-member-actions';
      const role = document.createElement('span');
      role.className = member.role === 'ADMIN' ? 'role-pill role-admin' : 'role-pill';
      role.textContent = member.role === 'ADMIN' ? 'Admin' : 'Member';
      actions.appendChild(role);

      if (isAdmin && member.userId !== me) {
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'btn btn-danger btn-small';
        removeButton.textContent = 'Remove';
        removeButton.disabled = details.members.length <= 3;
        removeButton.title = removeButton.disabled
          ? 'A group must retain at least three members'
          : `Remove ${member.displayName || member.username}`;
        removeButton.addEventListener('click', () => removeGroupMember(member));
        actions.appendChild(removeButton);
      }

      item.append(identity, actions);
      list.appendChild(item);
    });

    if (details.members.length <= 3 && isAdmin) {
      setGroupInfoFeedback('This group needs at least three members. Add someone before removing a member.');
    } else {
      setGroupInfoFeedback('');
    }
  }

  async function refreshGroupInfo() {
    if (!currentConversation || currentConversation.type !== 'GROUP') return;
    const conversationId = currentConversation.conversationId;
    const requestId = ++groupInfoRequestId;
    try {
      const details = await api.getGroupDetails(conversationId);
      if (
        requestId !== groupInfoRequestId ||
        !currentConversation ||
        currentConversation.conversationId !== conversationId
      ) return;
      renderGroupInfo(details);
    } catch (error) {
      if (requestId === groupInfoRequestId) {
        setGroupInfoFeedback(error.message || 'Could not load group information.', true);
      }
    }
  }

  async function openGroupInfo() {
    if (!currentConversation || currentConversation.type !== 'GROUP') return;
    if (!$('group-info-dialog').open) $('group-info-dialog').showModal();
    groupInfoState = null;
    $('group-admin-controls').hidden = true;
    $('group-member-list').replaceChildren();
    setGroupInfoFeedback('Loading group information...');
    await refreshGroupInfo();
  }

  function closeGroupInfo() {
    groupInfoRequestId += 1;
    groupSearchRequestId += 1;
    groupInfoState = null;
    $('group-admin-controls').hidden = true;
    $('group-member-list').replaceChildren();
    $('group-add-results').replaceChildren();
    if (groupSearchTimer) {
      clearTimeout(groupSearchTimer);
      groupSearchTimer = null;
    }
    if ($('group-info-dialog').open) $('group-info-dialog').close();
  }

  function closeCurrentGroup(message) {
    closeGroupInfo();
    currentConversation = null;
    historyState = {
      conversationId: null,
      hasMore: false,
      nextCursor: null,
      loading: false,
    };
    $('group-info-btn').hidden = true;
    $('chat-title').textContent = 'Select a conversation';
    $('chat-sub').textContent = '';
    $('typing-indicator').textContent = '';
    $('message-input').disabled = true;
    $('send-btn').disabled = true;
    $('message-pane').replaceChildren(emptyItem('Select a conversation or search for a user to start chatting.'));
    $('chat-view').dataset.pane = 'list';
    void loadConversations();
    if (message) ui.toast('info', message);
  }

  async function removeGroupMember(member) {
    if (!currentConversation || !groupInfoState) return;
    const conversationId = currentConversation.conversationId;
    try {
      await api.removeGroupMember(conversationId, member.userId);
      ui.toast('success', `${member.displayName || member.username} removed from the group.`);
      await refreshGroupInfo();
      await loadConversations();
    } catch (error) {
      setGroupInfoFeedback(error.message || 'Could not remove this member.', true);
    }
  }

  $('group-info-btn').addEventListener('click', () => {
    void openGroupInfo();
  });
  $('group-info-close').addEventListener('click', closeGroupInfo);

  $('group-rename-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!currentConversation || !groupInfoState) return;
    const name = $('group-rename-input').value.trim();
    if (name.length < 3 || name.length > 50) {
      setGroupInfoFeedback('Group name must contain between 3 and 50 characters.', true);
      return;
    }
    try {
      const updated = await api.renameGroup(currentConversation.conversationId, name);
      currentConversation.name = updated.name;
      $('chat-title').textContent = updated.name;
      ui.toast('success', 'Group name updated.');
      await loadConversations();
      await refreshGroupInfo();
    } catch (error) {
      setGroupInfoFeedback(error.message || 'Could not rename the group.', true);
    }
  });

  $('group-add-search').addEventListener('input', () => {
    const query = $('group-add-search').value.trim();
    const requestId = ++groupSearchRequestId;
    if (groupSearchTimer) clearTimeout(groupSearchTimer);
    const results = $('group-add-results');
    results.replaceChildren();
    if (!query) return;

    groupSearchTimer = setTimeout(async () => {
      try {
        const users = await api.searchUsers(query);
        if (requestId !== groupSearchRequestId) return;
        const existing = new Set((groupInfoState?.members || []).map((member) => member.userId));
        const candidates = (users || []).filter((user) => !existing.has(String(user.userId)));
        if (!candidates.length) {
          const empty = document.createElement('p');
          empty.className = 'group-help';
          empty.textContent = 'No new users found.';
          results.replaceChildren(empty);
          return;
        }
        results.replaceChildren();
        candidates.forEach((user) => {
          const row = document.createElement('div');
          row.className = 'group-add-result';
          const label = document.createElement('span');
          label.textContent = `${user.displayName || user.username} (@${user.username})`;
          const addButton = document.createElement('button');
          addButton.type = 'button';
          addButton.className = 'btn btn-primary btn-small';
          addButton.textContent = 'Add';
          addButton.addEventListener('click', async () => {
            addButton.disabled = true;
            try {
              await api.addGroupMember(currentConversation.conversationId, user.userId);
              $('group-add-search').value = '';
              results.replaceChildren();
              ui.toast('success', `${user.displayName || user.username} added to the group.`);
              await refreshGroupInfo();
              await loadConversations();
            } catch (error) {
              addButton.disabled = false;
              setGroupInfoFeedback(error.message || 'Could not add this member.', true);
            }
          });
          row.append(label, addButton);
          results.appendChild(row);
        });
      } catch (error) {
        if (requestId === groupSearchRequestId) {
          setGroupInfoFeedback(error.message || 'User search failed.', true);
        }
      }
    }, 250);
  });

  $('group-leave-btn').addEventListener('click', async () => {
    if (!currentConversation) return;
    const conversationId = currentConversation.conversationId;
    const confirmed = window.confirm('Leave this group? You will stop receiving its messages.');
    if (!confirmed) return;
    try {
      const result = await api.leaveGroup(conversationId);
      if (currentConversation && currentConversation.conversationId === conversationId) {
        closeCurrentGroup(result.deleted
          ? 'You left the group. It was deleted because fewer than three members remained.'
          : 'You left the group.');
      }
    } catch (error) {
      setGroupInfoFeedback(error.message || 'Could not leave the group.', true);
    }
  });

  $('group-info-dialog').addEventListener('close', () => {
    groupInfoRequestId += 1;
  });

  
  async function loadOlderMessages() {
    const state = historyState;
    const conversation = currentConversation;

    if (
      !conversation ||
      !state.hasMore ||
      !state.nextCursor ||
      state.loading
    ) {
      return;
    }

    state.loading = true;

    try {
      const res = await api.getMessages(
        conversation.conversationId,
        {
          limit: 50,
          before: state.nextCursor,
        }
      );

      if (
        currentConversation !== conversation ||
        historyState !== state
      ) {
        return;
      }

      Chat.messages.prepend(res.messages || []);

      state.hasMore = Boolean(res.hasMore);
      state.nextCursor = res.nextCursor || null;
    } catch (err) {
      ui.toast(
        'error',
        err.message || 'Could not load older messages.'
      );
    } finally {
      state.loading = false;
    }
  }

  $('message-pane').addEventListener('scroll', () => {
    if ($('message-pane').scrollTop <= 50) {
      void loadOlderMessages();
    }
  });

  $('back-btn').onclick = () => {
    $('chat-view').dataset.pane = 'list';
  };

  // Enter sends; Shift+Enter inserts a new line.
  $('message-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      $('message-form').requestSubmit();
    }
  });

  $('message-input').addEventListener('input', () => {
    if (
      !currentConversation ||
      !api.session.token ||
      Chat.mock.enabled
    ) {
      return;
    }

    const now = Date.now();

    if (now - lastTypingSentAt < 1000) return;

    lastTypingSentAt = now;

    ws.send('typing:start', {
      conversationId: currentConversation.conversationId,
    });
  });

  $('message-form').addEventListener('submit', (e) => {
    e.preventDefault();

    if (remoteTypingTimeout) {
      clearTimeout(remoteTypingTimeout);
      remoteTypingTimeout = null;
    }

    $('typing-indicator').textContent = '';

    const input = $('message-input');
    const content = input.value;

    if (!content.trim()) {
      return ui.toast('error', 'Message cannot be empty');
    }

    if (content.length > 2000) {
      return ui.toast(
        'error',
        'Message is too long (maximum 2,000 characters)'
      );
    }

    if (!currentConversation) return;

    const user = api.session.user || {};

    const payload = {
      conversationId: currentConversation.conversationId,
      content,
      clientMsgId:
        (crypto.randomUUID && crypto.randomUUID()) ||
        String(Date.now()),
    };

    Chat.messages.add({
      ...payload,
      senderId: user.userId,
      senderName: 'You',
      sentAt: new Date().toISOString(),
      status: 'SENDING',
    });

    const sent = Chat.mock.enabled
      ? Chat.mock.send(payload)
      : ws.send('message:send', payload);

    if (!sent) {
      Chat.messages.markFailed(payload.clientMsgId);
      ui.toast('error', 'Not connected. Message was not sent.');
    }

    input.value = '';
  });

  // ---------- WebSocket events ----------

  // CA-36: Re-sync messages missed while the WebSocket was disconnected.
  ws.on('auth:ok', async () => {
    ensureReadAckQueue().retryPending();
    if (Chat.mock.enabled || !currentConversation) return;

    const conversationId = currentConversation.conversationId;
    acknowledgeConversationRead(conversationId);
    const lastMessageId = Chat.messages.lastMessageId();

    try {
      const options = lastMessageId
        ? {
            after: lastMessageId,
            limit: 100,
          }
        : {
            limit: 50,
          };

      const res = await api.getMessages(
        conversationId,
        options
      );

      // Ignore results if the user switched conversations.
      if (
        !currentConversation ||
        currentConversation.conversationId !== conversationId
      ) {
        return;
      }

      (res.messages || []).forEach((message) => {
        Chat.messages.add(message);

        // Acknowledge recovered messages.
        if (message.messageId) {
          ws.send('message:ack', {
            messageId: String(message.messageId),
          });
        }
      });
    } catch (err) {
      console.error('Message re-sync failed:', err);
    }
  });

  // New messages pushed by the server.
  ws.on('message:new', (p) => {
    const message = (p && p.message) || p;

    if (!message) return;

    const normalized = api.normalize.message(message);
    const shown = Chat.messages.add(normalized);
    const openConversationId = isCurrentConversationOpen()
      ? currentConversation.conversationId
      : null;

    const messageId = message.messageId || message._id;

    if (!Chat.mock.enabled && messageId) {
      ws.send('message:ack', {
        messageId: String(messageId),
      });
    }

    const activeConversationId = $('chat-view').dataset.pane === 'chat' && currentConversation
      ? currentConversation.conversationId
      : null;
    if (shown && activeConversationId === normalized.conversationId) {
      acknowledgeRead([normalized], currentConversation.conversationId);
    } else {
      const conversation = conversationCache.find(
        (item) => item.conversationId === normalized.conversationId
      );
      Chat.unread.notifyIncoming(
        normalized,
        activeConversationId,
        conversation && conversation.name,
        ui.toast
      );
      unreadRefresh.schedule();
    }
  });

  ws.on('message:read:processed', (payload) => {
    if (payload && payload.conversationId) {
      ensureReadAckQueue().confirm(payload.conversationId, payload.lastReadMessageId);
      unreadRefresh.schedule();
    }
  });

  ws.on('message:status', (p) => {
    Chat.messages.setStatus(p);
  });

  // CA-34: Typing indicator.
  ws.on('typing:update', (p) => {
    if (!p || !currentConversation) return;

    if (
      p.conversationId !== currentConversation.conversationId
    ) {
      return;
    }

    const indicator = $('typing-indicator');
    const username = Chat.names[p.userId] || 'Someone';

    indicator.textContent = `${username} is typing...`;

    if (remoteTypingTimeout) {
      clearTimeout(remoteTypingTimeout);
    }

    remoteTypingTimeout = setTimeout(() => {
      indicator.textContent = '';
      remoteTypingTimeout = null;
    }, 3000);
  });

  // ---------- presence ----------
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
      name.textContent =
        Chat.names[user.userId] || user.userId;

      const status = document.createElement('div');
      status.className = 'conv-last';

      if (user.status === 'online') {
        status.textContent = 'Online';
      } else {
        status.textContent = user.lastSeen
          ? `Last seen: ${new Date(
              user.lastSeen
            ).toLocaleString()}`
          : 'Offline';
      }

      li.tabIndex = 0;
      li.setAttribute('role', 'button');
      li.setAttribute('aria-label', `Start conversation with ${name.textContent}`);
      const startChat = () => startPrivateConversation({
        userId: user.userId,
        username: Chat.names[user.userId] || user.userId,
        displayName: Chat.names[user.userId] || user.userId,
      }, li, status);
      li.onclick = startChat;
      li.onkeydown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          startChat();
        }
      };

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

    // CA-32: Keep conversations and the group info panel synchronized.
  ws.on('group:update', async (payload) => {
    if (!payload) return;
    const groupId = payload.conversation && payload.conversation.conversationId;
    const me = String((api.session.user || {}).userId || '');
    const affectsCurrent = Boolean(
      currentConversation &&
      currentConversation.type === 'GROUP' &&
      groupId === currentConversation.conversationId
    );
    const removedSelf = (
      (payload.action === 'REMOVED' || payload.action === 'LEFT') &&
      String(payload.memberId) === me
    );

    await loadConversations();
    if (!affectsCurrent) return;

    if (payload.deleted || removedSelf) {
      closeCurrentGroup(
        payload.deleted
          ? 'This group is no longer available.'
          : 'You are no longer a member of this group.'
      );
      return;
    }

    if (payload.conversation && payload.conversation.name) {
      currentConversation.name = payload.conversation.name;
      $('chat-title').textContent = payload.conversation.name;
    }
    if ($('group-info-dialog').open) {
      await refreshGroupInfo();
    }
  });

  // CA-39: Search users and start private conversations.
  const searchInput = $('search-input');
  let searchTimeout = null;
  let searchRequestId = 0;

  function renderSearchResults(users) {
    const list = $('conversation-list');
    list.replaceChildren();

    if (!users.length) {
      list.appendChild(emptyItem('No users found'));
      return;
    }

    users.forEach((user) => {
      const li = document.createElement('li');
      li.className = 'conv';
      li.tabIndex = 0;

      const details = document.createElement('div');

      const name = document.createElement('div');
      name.className = 'conv-name';
      name.textContent = user.displayName || user.username;

      const username = document.createElement('div');
      username.className = 'conv-last';
      username.textContent = '@' + user.username;

      details.append(name, username);
      li.appendChild(details);

      const startChat = () => startPrivateConversation(user, li, username);

      li.onclick = startChat;

      li.onkeydown = (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          startChat();
        }
      };

      list.appendChild(li);
    });
  }

  async function startPrivateConversation(user, item, statusLabel) {
    if (item.dataset.loading === 'true') return;
    item.dataset.loading = 'true';
    const originalStatus = statusLabel.textContent;
    statusLabel.textContent = 'Starting conversation...';

    try {
      const result = await api.createPrivateConversation(user.userId);
      if (!result || !result.conversation) {
        throw new Error('The server did not return a conversation. Please try again.');
      }

      if (searchInput) searchInput.value = '';
      searchRequestId += 1;
      if (searchTimeout) clearTimeout(searchTimeout);

      await loadConversations();
      await openConversation(result.conversation);
    } catch (err) {
      item.dataset.loading = 'false';
      statusLabel.textContent = originalStatus;
      ui.toast('error', err.message || 'Could not start conversation. Please try again.');
    }
  }

  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim();
    const requestId = ++searchRequestId;

    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    if (!query) {
      loadConversations();
      return;
    }

    searchTimeout = setTimeout(async () => {
      const list = $('conversation-list');
      list.replaceChildren();
      list.appendChild(emptyItem('Searching...'));

      try {
        const users = await api.searchUsers(query);

        if (requestId !== searchRequestId) return;

        renderSearchResults(users || []);
      } catch (err) {
        if (requestId !== searchRequestId) return;

        list.replaceChildren(emptyItem(`Search failed: ${err.message || 'Please try again.'}`));
        ui.toast('error', err.message || 'User search failed. Please try again.');
      }
    }, 250);
  });


  // ---------- Help / About dialog ----------
  $('about-btn').onclick = () => {
    $('about-dialog').showModal();
  };

  $('about-close').onclick = () => {
    $('about-dialog').close();
  };

  // ---------- start ----------
  if (api.session.token) {
    showChat();
  } else {
    showAuth('login');
  }
})(window.Chat);
