const {
  getLastSeen,
  isOnline,
  markOffline,
  markOnline,
} = require('../src/modules/presence/presenceService');

describe('presence service connection tracking', () => {
  it('reports only the first active connection as a new online transition', () => {
    const userId = 'presence-first-connection';

    expect(markOnline(userId)).toBe(true);
    expect(markOnline(userId)).toBe(false);
    expect(isOnline(userId)).toBe(true);
  });

  it('ignores disconnects for users with no active connection', () => {
    expect(markOffline('presence-never-connected')).toBeNull();
    expect(isOnline('presence-never-connected')).toBe(false);
  });

  it('keeps a multi-connection user online until the final connection closes', () => {
    const userId = 'presence-two-connections';
    markOnline(userId);
    markOnline(userId);

    expect(markOffline(userId)).toBeNull();
    expect(isOnline(userId)).toBe(true);

    const lastSeen = markOffline(userId);
    expect(lastSeen).toBeInstanceOf(Date);
    expect(isOnline(userId)).toBe(false);
    expect(getLastSeen(userId)).toBe(lastSeen);
  });
});
