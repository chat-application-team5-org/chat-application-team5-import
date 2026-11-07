const { validateMessageContent } = require('../src/modules/messaging/validation');

describe('validateMessageContent (CA-23)', () => {
  it('accepts a normal message', () => {
    expect(validateMessageContent('Hello')).toBe('Hello');
  });
  it('accepts exactly 2000 characters', () => {
    expect(() => validateMessageContent('a'.repeat(2000))).not.toThrow();
  });
  it('rejects 2001 characters with MESSAGE_TOO_LONG', () => {
    expect(() => validateMessageContent('a'.repeat(2001))).toThrow(
      expect.objectContaining({ code: 'MESSAGE_TOO_LONG' })
    );
  });
  it.each([['empty string', ''], ['only spaces', '   '], ['tabs/newlines', '\t\n'], ['undefined', undefined], ['null', null], ['number', 5]])(
    'rejects %s',
    (_name, value) => {
      expect(() => validateMessageContent(value)).toThrow(
        expect.objectContaining({ code: 'VALIDATION_ERROR' })
      );
    }
  );
});

describe('message sanitization (CA-26)', () => {
  const { sanitizeMessageContent } = require('../src/modules/messaging/validation');
  it.each(['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '&lt;script&gt;', `Quotes ' " and backtick \``])(
    'escapes HTML metacharacters without losing the original text: %s', (payload) => {
      const validator = require('validator');
      const escaped = sanitizeMessageContent(payload);
      expect(escaped).not.toMatch(/[<>]/);
      expect(validator.unescape(escaped)).toBe(payload);
    }
  );
  it('checks length before escaping, including worst-case expansion', () => {
    expect(sanitizeMessageContent("'".repeat(2000))).toHaveLength(12000);
    expect(() => sanitizeMessageContent("'".repeat(2001))).toThrow(expect.objectContaining({ code: 'MESSAGE_TOO_LONG' }));
  });
});
