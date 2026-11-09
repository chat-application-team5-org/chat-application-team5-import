// Shared unread-count title and notification behavior (CA-38).
window.Chat = window.Chat || {};
(function (Chat) {
  const originalTitle = document.title;
  const notifiedMessageIds = new Set();
  const MAX_NOTIFIED_MESSAGE_IDS = 500;

  function updateTitle(unreadCount) {
    const count = Number.isFinite(unreadCount) && unreadCount > 0
      ? Math.floor(unreadCount)
      : 0;
    document.title = count ? `(${count}) ${originalTitle}` : originalTitle;
  }

  function notifyIncoming(message, openConversationId, conversationName, showToast) {
    if (!message || !message.conversationId ||
        String(message.conversationId) === String(openConversationId)) {
      return false;
    }

    const messageId = message.messageId || message._id || message.clientMsgId;
    if (!messageId || notifiedMessageIds.has(String(messageId))) return false;

    notifiedMessageIds.add(String(messageId));
    if (notifiedMessageIds.size > MAX_NOTIFIED_MESSAGE_IDS) {
      const oldestMessageId = notifiedMessageIds.values().next().value;
      notifiedMessageIds.delete(oldestMessageId);
    }
    showToast('info', `New message in ${conversationName || 'a conversation'}`);
    return true;
  }

  Chat.unread = { updateTitle, notifyIncoming };
})(window.Chat);
