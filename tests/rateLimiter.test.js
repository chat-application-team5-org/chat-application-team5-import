const { createMessageRateLimiter } = require('../src/ws/rateLimiter');

test('allows 20 attempts per user across a sliding 10 second window', () => {
  let t = 0;
  const limiter = createMessageRateLimiter({ now: () => t });
  for (let i = 0; i < 20; i += 1) expect(limiter.allow('a')).toBe(true);
  expect(limiter.allow('a')).toBe(false);
  expect(limiter.allow('b')).toBe(true);
  t = 9999;
  expect(limiter.allow('a')).toBe(false);
  t = 10000;
  expect(limiter.allow('a')).toBe(true);
  limiter.purge();
  t = 20000;
  limiter.purge();
  expect(limiter.allow('a')).toBe(true);
});
