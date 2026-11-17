const path = require('path');
const { spawnSync } = require('child_process');

describe('performance benchmark safety', () => {
  it('refuses to create benchmark data without explicit disposable-database opt-in', () => {
    const script = path.join(__dirname, '..', 'scripts', 'performance-test.js');
    const result = spawnSync(process.execPath, [
      script,
      '--duration=1',
      '--users=2',
      '--clients=2',
      '--auth-probes=1',
    ], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, PERF_ALLOW_WRITES: '' },
      encoding: 'utf8',
      timeout: 5000,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Set PERF_ALLOW_WRITES=1 only when BASE_URL targets a disposable test database.');
  });
});
