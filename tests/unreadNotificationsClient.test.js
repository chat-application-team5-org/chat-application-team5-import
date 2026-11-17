const fs = require('fs');
const vm = require('vm');

function loadUnreadClient() {
  const document = { title: 'Chat Application' };
  const window = { Chat: {} };
  const context = vm.createContext({ window, document });
  vm.runInContext(fs.readFileSync('public/js/unread.js', 'utf8'), context);
  return { document, unread: window.Chat.unread };
}

describe('unread client notifications (CA-38)', () => {
  it('TC-STS-02 refreshes the title to three unread and restores it after the read refresh', () => {
    const { document, unread } = loadUnreadClient();
    const showToast = jest.fn();
    const callbacks = new Map();
    let nextTimerId = 1;
    const timers = {
      setTimeout(callback) {
        const id = nextTimerId++;
        callbacks.set(id, callback);
        return id;
      },
      clearTimeout(id) {
        callbacks.delete(id);
      },
    };
    let serverConversations = [
      { conversationId: 'conversation-a', unreadCount: 0 },
      { conversationId: 'conversation-b', unreadCount: 3 },
    ];
    const refreshFromServer = jest.fn(() => (
      unread.updateTitleFromConversations(serverConversations)
    ));
    const scheduler = unread.createRefreshScheduler(refreshFromServer, 75, timers);

    for (let index = 1; index <= 3; index += 1) {
      expect(unread.notifyIncoming({
        messageId: `message-${index}`,
        conversationId: 'conversation-b',
        content: 'message body must not be exposed',
      }, 'conversation-a', 'Conversation B', showToast)).toBe(true);
      scheduler.schedule();
    }

    expect(callbacks.size).toBe(1);
    const unreadRefresh = callbacks.values().next().value;
    callbacks.clear();
    unreadRefresh();
    expect(showToast).toHaveBeenCalledTimes(3);
    expect(showToast).toHaveBeenCalledWith('info', 'New message in Conversation B');
    expect(showToast.mock.calls.flat().join(' ')).not.toContain('message body');
    expect(document.title).toBe('(3) Chat Application');

    // Opening the conversation persists a read position; the refreshed server
    // list now reports zero and drives the title back to its original value.
    serverConversations = serverConversations.map((conversation) => ({
      ...conversation,
      unreadCount: conversation.conversationId === 'conversation-b' ? 0 : conversation.unreadCount,
    }));
    scheduler.schedule();
    const readRefresh = callbacks.values().next().value;
    callbacks.clear();
    readRefresh();

    expect(document.title).toBe('Chat Application');
    expect(refreshFromServer).toHaveBeenCalledTimes(2);
  });

  it('sums unread counts across conversations when updating the title', () => {
    const { document, unread } = loadUnreadClient();

    unread.updateTitleFromConversations([
      { unreadCount: 2 },
      { unreadCount: 4 },
      { unreadCount: 0 },
    ]);
    expect(document.title).toBe('(6) Chat Application');

    unread.updateTitleFromConversations([]);
    expect(document.title).toBe('Chat Application');
  });

  it('deduplicates repeated WebSocket deliveries and ignores the open conversation', () => {
    const { unread } = loadUnreadClient();
    const showToast = jest.fn();
    const message = { messageId: 'message-1', conversationId: 'conversation-b' };

    expect(unread.notifyIncoming(message, 'conversation-a', 'Conversation B', showToast)).toBe(true);
    expect(unread.notifyIncoming(message, 'conversation-a', 'Conversation B', showToast)).toBe(false);
    expect(unread.notifyIncoming(message, 'conversation-b', 'Conversation B', showToast)).toBe(false);
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  it('bounds retained notification IDs while keeping recent IDs deduplicated', () => {
    const { unread } = loadUnreadClient();
    const showToast = jest.fn();
    for (let index = 0; index < 501; index += 1) {
      unread.notifyIncoming({
        messageId: `message-${index}`,
        conversationId: 'conversation-b',
      }, null, 'Conversation B', showToast);
    }

    expect(unread.notifyIncoming({
      messageId: 'message-500', conversationId: 'conversation-b',
    }, null, 'Conversation B', showToast)).toBe(false);
    expect(unread.notifyIncoming({
      messageId: 'message-0', conversationId: 'conversation-b',
    }, null, 'Conversation B', showToast)).toBe(true);
  });

  it('coalesces a burst of unread refresh requests into one server refresh', () => {
    const { unread } = loadUnreadClient();
    const callbacks = new Map();
    let nextId = 1;
    const timers = {
      setTimeout(callback) {
        const id = nextId++;
        callbacks.set(id, callback);
        return id;
      },
      clearTimeout(id) {
        callbacks.delete(id);
      },
    };
    const refresh = jest.fn();
    const scheduler = unread.createRefreshScheduler(refresh, 75, timers);

    scheduler.schedule();
    scheduler.schedule();
    scheduler.schedule();
    expect(callbacks.size).toBe(1);
    callbacks.values().next().value();

    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
