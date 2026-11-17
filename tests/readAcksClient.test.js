const fs = require('fs');
const vm = require('vm');

function loadReadAcks() {
  const window = { Chat: {} };
  vm.runInContext(fs.readFileSync('public/js/readAcks.js', 'utf8'), vm.createContext({
    window,
    setTimeout,
    clearTimeout,
  }));
  return window.Chat.readAcks;
}

describe('durable read acknowledgement queue (CA-38)', () => {
  it('retains a disconnected acknowledgement and retries it after reconnect', () => {
    const readAcks = loadReadAcks();
    const send = jest.fn().mockReturnValueOnce(false).mockReturnValue(true);
    const queue = readAcks.create(send);

    expect(queue.queue('64b7f0c2a1b2c3d4e5f6073a', '64b7f0c2a1b2c3d4e5f60730')).toBe(true);
    expect(queue.pending.has('64b7f0c2a1b2c3d4e5f6073a')).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);

    queue.retryPending();

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith('64b7f0c2a1b2c3d4e5f6073a', '64b7f0c2a1b2c3d4e5f60730');
    expect(queue.confirm('64b7f0c2a1b2c3d4e5f6073a', '64b7f0c2a1b2c3d4e5f60730')).toBe(true);
    expect(queue.pending.has('64b7f0c2a1b2c3d4e5f6073a')).toBe(false);
  });

  it('retries sent acknowledgements without confirmation and never accepts an older position', () => {
    const readAcks = loadReadAcks();
    const timers = new Map();
    let nextTimerId = 1;
    const setTimer = jest.fn((callback) => {
      const id = nextTimerId++;
      timers.set(id, callback);
      return id;
    });
    const clearTimer = jest.fn((id) => timers.delete(id));
    const send = jest.fn().mockReturnValue(true);
    const queue = readAcks.create(send, { setTimer, clearTimer });
    const newest = '64b7f0c2a1b2c3d4e5f60731';

    queue.queue('64b7f0c2a1b2c3d4e5f6073a', newest);
    expect(queue.queue('64b7f0c2a1b2c3d4e5f6073a', '64b7f0c2a1b2c3d4e5f60730')).toBe(false);
    expect(queue.confirm('64b7f0c2a1b2c3d4e5f6073a', '64b7f0c2a1b2c3d4e5f60730')).toBe(false);

    const [retryId, retry] = timers.entries().next().value;
    timers.delete(retryId);
    retry();
    expect(send).toHaveBeenCalledTimes(2);
    expect(queue.confirm('64b7f0c2a1b2c3d4e5f6073a', newest)).toBe(true);
    expect(timers.size).toBe(0);
  });

  it('keeps a failed send pending and retries it on a later connection', () => {
    const queue = loadReadAcks().create(() => { throw new Error('socket send failed'); });
    expect(queue.queue('64b7f0c2a1b2c3d4e5f6073a', '64b7f0c2a1b2c3d4e5f60730')).toBe(true);
    expect(queue.pending.size).toBe(1);
    expect(() => queue.retryPending()).not.toThrow();
    expect(queue.pending.size).toBe(1);
  });

  it('restores pending acknowledgements from session storage after a page refresh', () => {
    const readAcks = loadReadAcks();
    const values = new Map();
    const storage = {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
    };
    const sendBeforeRefresh = jest.fn().mockReturnValue(false);
    readAcks.create(sendBeforeRefresh, { storage }).queue(
      '64b7f0c2a1b2c3d4e5f6073a', '64b7f0c2a1b2c3d4e5f60730'
    );
    const sendAfterRefresh = jest.fn().mockReturnValue(true);
    const restored = readAcks.create(sendAfterRefresh, { storage });

    expect(restored.pending.has('64b7f0c2a1b2c3d4e5f6073a')).toBe(true);
    restored.retryPending();
    expect(sendAfterRefresh).toHaveBeenCalledWith(
      '64b7f0c2a1b2c3d4e5f6073a', '64b7f0c2a1b2c3d4e5f60730'
    );
    expect(restored.confirm('64b7f0c2a1b2c3d4e5f6073a', '64b7f0c2a1b2c3d4e5f60730')).toBe(true);
    expect(JSON.parse(values.get('chat.read-acknowledgements.v1'))).toEqual([]);
  });
});
