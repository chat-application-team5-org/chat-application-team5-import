
// WebSocket client wrapper.
// Authenticates with the JWT after opening and automatically reconnects
// after unexpected disconnections using exponential back-off.

window.Chat = window.Chat || {};

(function (Chat) {
  let socket = null;
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let currentToken = null;
  let manuallyClosed = true;

  const handlers = {};
  let statusListener = () => {};

  const BASE_DELAY = 1000;
  const MAX_DELAY = 30000;

  function url() {
    return (location.protocol === 'https:' ? 'wss://' : 'ws://')
      + location.host + '/ws';
  }

  function setStatus(state) {
    statusListener(state);
  }

  function emit(type, payload) {
    (handlers[type] || []).forEach((fn) => fn(payload));
  }

  function scheduleReconnect() {
    if (manuallyClosed || reconnectTimer || !currentToken) return;

    const delay = Math.min(
      BASE_DELAY * (2 ** reconnectAttempt),
      MAX_DELAY
    );

    reconnectAttempt += 1;
    setStatus('reconnecting');

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      openSocket();
    }, delay);
  }

    function openSocket() {
    if (manuallyClosed || !currentToken) return;

    setStatus(reconnectAttempt === 0 ? 'connecting' : 'reconnecting');

    let activeSocket;

    try {
      activeSocket = new WebSocket(url());
    } catch (error) {
      scheduleReconnect();
      return;
    }

    socket = activeSocket;

    activeSocket.onopen = () => {
      if (socket !== activeSocket || manuallyClosed) return;

      activeSocket.send(JSON.stringify({
        type: 'auth',
        payload: { token: currentToken }
      }));
    };

    activeSocket.onmessage = (ev) => {
      if (socket !== activeSocket) return;

      let msg;

      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }

      if (msg.type === 'auth:ok') {
        reconnectAttempt = 0;
        setStatus('online');
      }

      emit(msg.type, msg.payload);
    };

    activeSocket.onclose = (ev) => {
      if (socket !== activeSocket) return;

      socket = null;
      emit('close', { code: ev.code });

      if (!manuallyClosed) {
        scheduleReconnect();
      }
    };

    activeSocket.onerror = () => {
      // The close event handles reconnection.
    };
  }

  function connect(token) {
    close();

    currentToken = token;
    manuallyClosed = false;
    reconnectAttempt = 0;

    openSocket();
  }

  function send(type, payload) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    socket.send(JSON.stringify({ type, payload }));
    return true;
  }

  function on(type, fn) {
    (handlers[type] = handlers[type] || []).push(fn);
  }

  function onStatus(fn) {
    statusListener = fn;
  }

  function close() {
    manuallyClosed = true;

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    currentToken = null;
    reconnectAttempt = 0;

    if (socket) {
      const oldSocket = socket;
      socket = null;
      oldSocket.onclose = null;
      oldSocket.close();
    }

    setStatus('offline');
  }

  // inject allows mock mode and tests to simulate server events.
  Chat.ws = { connect, send, on, onStatus, close, inject: emit };
})(window.Chat);
