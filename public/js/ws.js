// WebSocket client wrapper (SAD 4.3, WebSocket events).
// Opens /ws, sends the auth event with the JWT right after the socket opens
// (never in the URL, SAD ADR-2), and dispatches incoming events to handlers.
// TODO CA-36: automatic reconnect with exponential back-off (1 s ... 30 s) and re-sync.
window.Chat = window.Chat || {};
(function (Chat) {
  let socket = null;
  const handlers = {};
  let statusListener = () => {};

  function url() {
    return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  }

  function setStatus(state) { statusListener(state); }

  function emit(type, payload) {
    (handlers[type] || []).forEach((fn) => fn(payload));
  }

  function connect(token) {
    close();
    setStatus('connecting');
    socket = new WebSocket(url());
    socket.onopen = () => send('auth', { token });
    socket.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === 'auth:ok') setStatus('online');
      emit(msg.type, msg.payload);
    };
    socket.onclose = (ev) => { setStatus('offline'); emit('close', { code: ev.code }); };
    socket.onerror = () => { /* onclose follows */ };
  }

  function send(type, payload) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify({ type, payload }));
    return true;
  }

  function on(type, fn) { (handlers[type] = handlers[type] || []).push(fn); }
  function onStatus(fn) { statusListener = fn; }

  function close() {
    if (socket) {
      socket.onclose = null;
      socket.close();
      socket = null;
    }
    setStatus('offline');
  }

  Chat.ws = { connect, send, on, onStatus, close };
})(window.Chat);
