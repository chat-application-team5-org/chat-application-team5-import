const fs = require('fs');
const vm = require('vm');

function loadUnreadModule() {
  const document = { title: 'Chat Application' };
  const window = { Chat: {} };
  const context = vm.createContext({ window, document });
  vm.runInContext(fs.readFileSync('public/js/unread.js', 'utf8'), context);
  return { document, unread: window.Chat.unread };
}

describe('unread notification client (CA-38)', () => {
  it('updates the browser title and restores its original value at zero', () => {
    const { document, unread } = loadUnreadModule();

    unread.updateTitle(3);
    expect(document.title).toBe('(3) Chat Application');
    unread.updateTitle(0);
    expect(document.title).toBe('Chat Application');
  });

  it('notifies once for an incoming message outside the open conversation without exposing content', () => {
    const { unread } = loadUnreadModule();
    const showToast = jest.fn();
    const message = {
      messageId: 'message-1',
      conversationId: 'conversation-2',
      content: 'private message body',
    };

    expect(unread.notifyIncoming(message, 'conversation-1', 'Project Team', showToast)).toBe(true);
    expect(unread.notifyIncoming(message, 'conversation-1', 'Project Team', showToast)).toBe(false);
    expect(unread.notifyIncoming(message, 'conversation-2', 'Project Team', showToast)).toBe(false);
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('info', 'New message in Project Team');
  });

  it('keeps deduplication bounded while retaining recent message IDs', () => {
    const { unread } = loadUnreadModule();
    const showToast = jest.fn();

    for (let index = 0; index < 501; index += 1) {
      unread.notifyIncoming({
        messageId: `message-${index}`,
        conversationId: 'conversation-2',
      }, null, 'Project Team', showToast);
    }

    expect(unread.notifyIncoming({
      messageId: 'message-500',
      conversationId: 'conversation-2',
    }, null, 'Project Team', showToast)).toBe(false);
    expect(unread.notifyIncoming({
      messageId: 'message-0',
      conversationId: 'conversation-2',
    }, null, 'Project Team', showToast)).toBe(true);
  });
});
