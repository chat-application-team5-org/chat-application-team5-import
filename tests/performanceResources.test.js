const { cpuPercentageBetween, createResourceSampler } = require('../scripts/performanceResources');

function cpu(user, system, idle, nice = 0, irq = 0) {
  return [{ times: { user, sys: system, idle, nice, irq } }];
}

describe('performance resource metrics', () => {
  it('calculates host CPU utilization from sampled CPU time deltas', () => {
    expect(cpuPercentageBetween(cpu(10, 5, 80, 0, 5), cpu(20, 10, 160, 0, 10))).toBe(20);
    expect(cpuPercentageBetween(cpu(10, 5, 80), cpu(10, 5, 80))).toBeNull();
  });

  it('records CPU and memory peaks during sampling', () => {
    const cpuSnapshots = [cpu(0, 0, 0), cpu(10, 10, 80)];
    const freeMemory = [1.25, 0.75, 0.5].map((value) => value * (1024 ** 3));
    const processRss = [0.1, 0.2, 0.15];
    let intervalCallback;
    const timers = {
      setInterval: jest.fn((callback) => { intervalCallback = callback; return 42; }),
      clearInterval: jest.fn(),
    };
    const osModule = {
      cpus: jest.fn(() => cpuSnapshots.shift()),
      totalmem: () => 2 * (1024 ** 3),
      freemem: () => freeMemory.shift(),
    };
    const processModule = {
      memoryUsage: () => ({ rss: processRss.shift() * (1024 ** 3) }),
    };

    const monitor = createResourceSampler({ osModule, processModule, timers });
    intervalCallback();
    const result = monitor.stop();

    expect(timers.setInterval).toHaveBeenCalledWith(expect.any(Function), 1000);
    expect(timers.clearInterval).toHaveBeenCalledWith(42);
    expect(result.samples).toBe(3);
    expect(result.averageHostCpuPercent).toBe(20);
    expect(result.peakHostCpuPercent).toBe(20);
    expect(result.peakSystemUsedMemoryGiB).toBe(1.5);
    expect(result.minimumSystemFreeMemoryGiB).toBe(0.5);
    expect(result.peakBenchmarkProcessRssGiB).toBe(0.2);
  });
});
