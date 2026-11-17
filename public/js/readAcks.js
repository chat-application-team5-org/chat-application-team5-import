// Durable-in-session queue for read-position acknowledgements (CA-38).
window.Chat = window.Chat || {};
(function (Chat) {
  function create(send, options = {}) {
    const setTimer = options.setTimer || setTimeout;
    const clearTimer = options.clearTimer || clearTimeout;
    const storageKey = options.storageKey || 'chat.read-acknowledgements.v1';
    let storage = options.storage;
    if (storage === undefined) {
      try {
        storage = window.sessionStorage;
      } catch {
        storage = null;
      }
    }
    const pending = new Map();
    const timers = new Map();

    function persist() {
      if (!storage) return;
      try {
        storage.setItem(storageKey, JSON.stringify([...pending.entries()]));
      } catch {
        // The in-memory queue still retries for the life of this page.
      }
    }

    if (storage) {
      try {
        const saved = JSON.parse(storage.getItem(storageKey) || '[]');
        if (Array.isArray(saved)) {
          saved.forEach(([conversationId, acknowledgement]) => {
            if (/^[a-f\d]{24}$/i.test(String(conversationId || '')) &&
                acknowledgement && /^[a-f\d]{24}$/i.test(String(acknowledgement.lastReadMessageId || ''))) {
              pending.set(String(conversationId), {
                lastReadMessageId: String(acknowledgement.lastReadMessageId).toLowerCase(),
                attempts: Number(acknowledgement.attempts) || 0,
              });
            }
          });
        }
      } catch {
        // Ignore malformed or unavailable session storage.
      }
    }

    function cancelTimer(conversationId) {
      if (timers.has(conversationId)) clearTimer(timers.get(conversationId));
      timers.delete(conversationId);
    }

    function transmit(conversationId) {
      const acknowledgement = pending.get(conversationId);
      if (!acknowledgement) return false;
      cancelTimer(conversationId);

      let sent = false;
      try {
        sent = send(conversationId, acknowledgement.lastReadMessageId);
      } catch {
        sent = false;
      }
      if (!sent) return false;

      acknowledgement.attempts += 1;
      persist();
      const delay = Math.min(1000 * (2 ** (acknowledgement.attempts - 1)), 30000);
      timers.set(conversationId, setTimer(() => {
        timers.delete(conversationId);
        transmit(conversationId);
      }, delay));
      return true;
    }

    function queue(conversationId, lastReadMessageId) {
      if (!/^[a-f\d]{24}$/i.test(String(conversationId || '')) ||
          !/^[a-f\d]{24}$/i.test(String(lastReadMessageId || ''))) return false;
      const existing = pending.get(conversationId);
      const currentId = String(lastReadMessageId).toLowerCase();
      if (existing && existing.lastReadMessageId > currentId) return false;
      cancelTimer(conversationId);
      pending.set(conversationId, { lastReadMessageId: currentId, attempts: 0 });
      persist();
      transmit(conversationId);
      return true;
    }

    function confirm(conversationId, lastReadMessageId) {
      const acknowledgement = pending.get(conversationId);
      if (!acknowledgement || !lastReadMessageId ||
          String(lastReadMessageId).toLowerCase() < acknowledgement.lastReadMessageId) return false;
      cancelTimer(conversationId);
      pending.delete(conversationId);
      persist();
      return true;
    }

    function retryPending() {
      pending.forEach((_acknowledgement, conversationId) => transmit(conversationId));
    }

    function clear() {
      [...timers.keys()].forEach(cancelTimer);
      pending.clear();
      persist();
    }

    function pause() {
      [...timers.keys()].forEach(cancelTimer);
    }

    return { queue, confirm, retryPending, clear, pause, pending };
  }

  Chat.readAcks = { create };
})(window.Chat);
