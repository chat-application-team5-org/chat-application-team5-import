const os = require('node:os');

function cpuTotals(cpus) {
  return cpus.reduce((total, cpu) => {
    total.total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
    total.idle += cpu.times.idle;
    return total;
  }, { total: 0, idle: 0 });
}

function cpuPercentageBetween(previousCpu, currentCpu) {
  const previous = cpuTotals(previousCpu);
  const current = cpuTotals(currentCpu);
  const totalDelta = current.total - previous.total;
  if (totalDelta <= 0) return null;
  const idleDelta = current.idle - previous.idle;
  return Number((((totalDelta - idleDelta) * 100) / totalDelta).toFixed(2));
}

function createResourceSampler({
  osModule = os,
  processModule = process,
  timers = globalThis,
  intervalMs = 1000,
} = {}) {
  let previousCpu = osModule.cpus();
  const cpuPercentSamples = [];
  const systemMemorySamples = [];
  const benchmarkRssSamples = [];

  function sample(includeCpu = true) {
    if (includeCpu) {
      const currentCpu = osModule.cpus();
      const cpuPercent = cpuPercentageBetween(previousCpu, currentCpu);
      if (cpuPercent !== null) cpuPercentSamples.push(cpuPercent);
      previousCpu = currentCpu;
    }

    const totalMemory = osModule.totalmem();
    const freeMemory = osModule.freemem();
    systemMemorySamples.push({ total: totalMemory, free: freeMemory });
    benchmarkRssSamples.push(processModule.memoryUsage().rss);
  }

  sample(false);
  const timer = timers.setInterval(sample, intervalMs);

  return {
    stop() {
      timers.clearInterval(timer);
      sample(false);
      const peakSystemUsedMemory = Math.max(...systemMemorySamples.map(({ total, free }) => total - free));
      const minimumSystemFreeMemory = Math.min(...systemMemorySamples.map(({ free }) => free));
      const averageCpu = cpuPercentSamples.length
        ? cpuPercentSamples.reduce((sum, value) => sum + value, 0) / cpuPercentSamples.length
        : null;
      return {
        sampleIntervalMs: intervalMs,
        samples: systemMemorySamples.length,
        averageHostCpuPercent: averageCpu === null ? null : Number(averageCpu.toFixed(2)),
        peakHostCpuPercent: cpuPercentSamples.length ? Math.max(...cpuPercentSamples) : null,
        peakSystemUsedMemoryGiB: Number((peakSystemUsedMemory / (1024 ** 3)).toFixed(2)),
        minimumSystemFreeMemoryGiB: Number((minimumSystemFreeMemory / (1024 ** 3)).toFixed(2)),
        peakBenchmarkProcessRssGiB: Number((Math.max(...benchmarkRssSamples) / (1024 ** 3)).toFixed(2)),
      };
    },
  };
}

module.exports = { cpuPercentageBetween, createResourceSampler };
