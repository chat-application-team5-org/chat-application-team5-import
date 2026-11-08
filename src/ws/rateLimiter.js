// Sliding window across all sockets for the same authenticated user.
// Process-local only; deployments with multiple instances need a shared store.
function createMessageRateLimiter({ limit = 20, windowMs = 10000, now = Date.now } = {}) {
  const attempts = new Map();
  function purge(timestamp = now()) {
    for (const [userId, times] of attempts) {
      const active = times.filter((time) => timestamp - time < windowMs);
      if (active.length) attempts.set(userId, active);
      else attempts.delete(userId);
    }
  }
  function allow(userId) {
    const timestamp = now();
    const key = String(userId);
    const active = (attempts.get(key) || []).filter((time) => timestamp - time < windowMs);
    if (active.length >= limit) {
      attempts.set(key, active);
      return false;
    }
    active.push(timestamp);
    attempts.set(key, active);
    return true;
  }
  return { allow, purge };
}
module.exports = { createMessageRateLimiter };
