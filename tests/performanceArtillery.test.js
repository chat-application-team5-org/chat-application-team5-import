const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const yaml = require('js-yaml');

const scriptPath = path.join(__dirname, '..', 'scripts', 'performance-artillery.yml');
const helperPath = path.join(__dirname, '..', 'scripts', 'prepare-artillery-chat.js');

describe('CA-45 Artillery WebSocket test', () => {
  it('defines 100 authenticated VUs using the application WebSocket event protocol', () => {
    const test = yaml.load(fs.readFileSync(scriptPath, 'utf8'));
    const phase = test.config.phases[0];
    const flow = test.scenarios[0].flow;

    expect(phase).toMatchObject({ arrivalCount: 100, maxVusers: 100 });
    expect(test.config.payload.fields).toEqual(['token', 'conversationId', 'username']);
    expect(test.config.ws.origin).toContain('ALLOWED_ORIGIN');
    expect(test.scenarios[0].engine).toBe('ws');
    expect(flow[1].send).toMatchObject({
      type: 'auth',
      payload: { token: '{{ token }}' },
    });
    expect(flow[2].wait.match).toEqual({ json: '$.type', value: 'auth:ok' });
    expect(flow[4].loop[0].send).toMatchObject({
      type: 'message:send',
      payload: { conversationId: '{{ conversationId }}' },
    });
    expect(flow[4].count).toBe(120);
  });

  it('refuses fixture creation unless the explicit write gate is enabled', () => {
    const result = spawnSync(process.execPath, [helperPath], {
      encoding: 'utf8',
      env: { ...process.env, PERF_ALLOW_WRITES: '' },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Set PERF_ALLOW_WRITES=1 only for a confirmed disposable database.');
  });
});
