const fs = require('fs');
const vm = require('vm');
const validator = require('validator');

test('encoded and legacy messages render literally, not as DOM elements', () => {
  const pane = { children: [], scrollHeight: 0, scrollTop: 0, clientHeight: 0,
    replaceChildren() { this.children = []; }, appendChild(child) { this.children.push(child); } };
  function element(tag) {
    return { tag, children: [], dataset: {}, append(...children) { this.children.push(...children); },
      appendChild(child) { this.children.push(child); }, setAttribute() {} };
  }
  const window = { Chat: {} };
  const document = { getElementById: () => pane, createElement: element };
  const context = vm.createContext({ window, document, sessionStorage: { getItem: () => null } });
  for (const file of ['public/js/api.js', 'public/js/messages.js']) {
    vm.runInContext(fs.readFileSync(file, 'utf8'), context);
  }
  const payload = '<img src=x onerror=alert(1)> &lt;script&gt; `';
  const encoded = window.Chat.api.normalize.message({ content: validator.escape(payload), contentEncoding: 'html-escaped-v1' });
  const legacy = window.Chat.api.normalize.message({ content: payload });
  expect(encoded.content).toBe(payload);
  expect(legacy.content).toBe(payload);
  window.Chat.messages.open('c', [{ ...encoded, messageId: 'm', conversationId: 'c', senderId: 'x', sentAt: '2026-01-01T00:00:00Z' }]);
  const text = pane.children[1].children[0].children[1];
  expect(text.textContent).toBe(payload);
  expect(text.children).toEqual([]);
});
