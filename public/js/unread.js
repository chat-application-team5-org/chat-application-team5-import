// Unread title and in-app notification helpers (CA-38 / TC-STS-02).
window.Chat = window.Chat || {};
(function (Chat) {
  const originalTitle = document.title;
  const notifiedMessageIds = new Set();
  const MAX_NOTIFIED_MESSAGE_IDS = 500;

  function createRefreshScheduler(refresh, delay = 75, timers = window) {
    let timer = null;
    return {
      schedule() {
        if (timer !== null) return;
        timer = timers.setTimeout(() => {
          timer = null;
          refresh();
        }, delay);
      },
      cancel() {
        if (timer !== null) timers.clearTimeout(timer);
        timer = null;
      },
    };
  }

  function updateTitle(unreadCount) {
    const count = Number.isFinite(unreadCount) && unreadCount > 0
      ? Math.floor(unreadCount)
      : 0;
    document.title = count ? `(${count}) ${originalTitle}` : originalTitle;
  }

  function updateTitleFromConversations(conversations) {
    const total = (conversations || []).reduce(
      (sum, conversation) => sum + (Number(conversation.unreadCount) || 0),
      0
    );
    updateTitle(total);
  }

  function notifyIncoming(message, activeConversationId, conversationName, showToast) {
    if (!message || !message.conversationId ||
        String(message.conversationId) === String(activeConversationId)) {
      return false;
    }

    const id = message.messageId || message._id || message.clientMsgId;
    if (!id || notifiedMessageIds.has(String(id))) return false;

    notifiedMessageIds.add(String(id));
    if (notifiedMessageIds.size > MAX_NOTIFIED_MESSAGE_IDS) {
      notifiedMessageIds.delete(notifiedMessageIds.values().next().value);
    }

    showToast('info', `New message in ${conversationName || 'a conversation'}`);
    return true;
  }

  Chat.unread = {
    updateTitle,
    updateTitleFromConversations,
    notifyIncoming,
    createRefreshScheduler,
  };
})(window.Chat);
