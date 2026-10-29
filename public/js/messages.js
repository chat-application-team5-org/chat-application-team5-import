// Message pane (CA-25, REQ-12): shows each message with sender, time and status,
// in chronological (server timestamp) order, with the user's own messages visually distinct.
// Message text is always inserted with textContent, never as HTML (REQ-13, XSS).
window.Chat = window.Chat || {};
(function (Chat) {
  const RANK = { FAILED: -1, SENDING: 0, SENT: 1, DELIVERED: 2, READ: 3 };
  const TICKS = { SENDING: '\u2026', SENT: '\u2713', DELIVERED: '\u2713\u2713', READ: '\u2713\u2713', FAILED: '!' };
  const LABELS = { SENDING: 'Sending', SENT: 'Sent', DELIVERED: 'Delivered', READ: 'Read', FAILED: 'Not sent' };

  let conversationId = null;
  let items = [];

  const pane = () => document.getElementById('message-pane');
  const myId = () => (Chat.api.session.user ? Chat.api.session.user.userId : null);

  function find(m) {
    return items.find((x) =>
      (m.messageId && x.messageId === m.messageId) ||
      (m.clientMsgId && x.clientMsgId === m.clientMsgId));
  }

  // Add a message, or merge it into an existing one (de-duplication by messageId / clientMsgId, SAD ADR-4).
  function upsert(m) {
    const existing = find(m);
    if (!existing) { items.push({ ...m }); return; }
    if (m.messageId) existing.messageId = m.messageId;
    if (m.sentAt) existing.sentAt = m.sentAt; // the server timestamp is authoritative (SRS 3.3)
    if (m.senderName && !existing.senderName) existing.senderName = m.senderName;
    if (m.status && (RANK[m.status] === undefined || RANK[m.status] >= (RANK[existing.status] ?? -1) || existing.status === 'FAILED')) {
      existing.status = m.status; // status never goes backwards
    }
  }

  function sortItems() {
    items.sort((a, b) => {
      const t = new Date(a.sentAt) - new Date(b.sentAt);
      if (t !== 0) return t;
      return String(a.messageId || a.clientMsgId).localeCompare(String(b.messageId || b.clientMsgId));
    });
  }

  function timeText(iso) {
    const d = new Date(iso); // server sends UTC; shown in the user's local time zone
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function dayText(iso) {
    const d = new Date(iso), now = new Date();
    if (d.toDateString() === now.toDateString()) return 'Today';
    return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  }

  function build(m) {
    const own = m.senderId === myId();
    const row = document.createElement('div');
    row.className = 'msg ' + (own ? 'own' : 'other');
    row.dataset.id = m.messageId || m.clientMsgId;

    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    const who = document.createElement('span');
    who.className = 'msg-sender';
    who.textContent = own ? 'You' : (m.senderName || (Chat.names && Chat.names[m.senderId]) || 'Contact');
    const time = document.createElement('time');
    time.className = 'msg-time';
    time.dateTime = m.sentAt;
    time.textContent = timeText(m.sentAt);
    meta.append(who, time);
    if (own) {
      const status = m.status || 'SENT';
      const ticks = document.createElement('span');
      ticks.className = 'ticks ' + status.toLowerCase();
      ticks.textContent = TICKS[status] || '';
      ticks.title = LABELS[status] || status;
      ticks.setAttribute('aria-label', LABELS[status] || status);
      meta.appendChild(ticks);
    }

    const text = document.createElement('div');
    text.className = 'msg-text';
    text.textContent = m.content;

    bubble.append(meta, text);
    row.appendChild(bubble);
    return row;
  }

  function render() {
    const box = pane();
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    box.replaceChildren();
    if (!items.length) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = 'No messages yet. Say hello!';
      box.appendChild(p);
      return;
    }
    let lastDay = '';
    items.forEach((m) => {
      const day = new Date(m.sentAt).toDateString();
      if (day !== lastDay) {
        const sep = document.createElement('div');
        sep.className = 'day-sep';
        sep.textContent = dayText(m.sentAt);
        box.appendChild(sep);
        lastDay = day;
      }
      box.appendChild(build(m));
    });
    if (nearBottom || items[items.length - 1].senderId === myId()) box.scrollTop = box.scrollHeight;
  }

  // ---------- public API ----------
  function open(id, list) {
    conversationId = id;
    items = [];
    (list || []).forEach(upsert);
    sortItems();
    render();
    pane().scrollTop = pane().scrollHeight;
  }

  // Add an older page at the beginning while preserving the visible viewport.
  function prepend(list) {
    const box = pane();
    const oldHeight = box.scrollHeight;
    const oldTop = box.scrollTop;
    (list || []).forEach(upsert);
    sortItems();
    render();
    box.scrollTop = oldTop + (box.scrollHeight - oldHeight);
  }

  function add(m) {
    if (m.conversationId !== conversationId) return false; // other conversations: unread badge is CA-38
    upsert(m);
    sortItems();
    render();
    return true;
  }

  function setStatus(p) {
    if (!p) return;
    const target = find(p);
    if (!target) return;
    upsert({ ...p, conversationId });
    sortItems();
    render();
  }

  function markFailed(clientMsgId) {
    const m = items.find((x) => x.clientMsgId === clientMsgId);
    if (m) { m.status = 'FAILED'; render(); }
  }

  Chat.messages = { open, prepend, add, setStatus, markFailed };
})(window.Chat);
