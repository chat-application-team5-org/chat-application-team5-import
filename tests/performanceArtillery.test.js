const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const yaml = require('js-yaml');

const scriptPath = path.join(__dirname, '..', 'scripts', 'performance-artillery.yml');
const smokeScriptPath = path.join(__dirname, '..', 'scripts', 'performance-artillery-smoke.yml');
const helperPath = path.join(__dirname, '..', 'scripts', 'prepare-artillery-chat.js');

describe('CA-45 Artillery WebSocket test', () => {
  it('defines 100 VUs that send auth without the callback-racy wait matcher', () => {
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
    expect(flow.some((step) => step.wait)).toBe(false);
    expect(flow[2].think).toBe(2);
    expect(flow[4].loop[0].send).toMatchObject({
      type: 'message:send',
      payload: { conversationId: '{{ conversationId }}' },
    });
    expect(flow[4].count).toBe(120);
  });

  it('defines the two-client smoke flow and parses both YAML scenarios', () => {
    const smokeTest = yaml.load(fs.readFileSync(smokeScriptPath, 'utf8'));
    const smokeFlow = smokeTest.scenarios[0].flow;

    expect(smokeTest.config.phases[0]).toMatchObject({ arrivalCount: 2, maxVusers: 2 });
    expect(smokeFlow[1].send).toMatchObject({ type: 'auth', payload: { token: '{{ token }}' } });
    expect(smokeFlow[2].think).toBe(2);
    expect(smokeFlow[3].send).toMatchObject({
      type: 'message:send',
      payload: { conversationId: '{{ conversationId }}' },
    });
    expect(smokeFlow.some((step) => step.wait)).toBe(false);
  });

  it('refuses fixture creation unless the explicit write gate is enabled', () => {
    const result = spawnSync(process.execPath, [helperPath], {
      encoding: 'utf8',
      env: { ...process.env, PERF_ALLOW_WRITES: '' },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Set PERF_ALLOW_WRITES=1 only for a confirmed disposable database.');
  });

  it('requires a caller-provided test password before contacting the app', () => {
    const result = spawnSync(process.execPath, [helperPath], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PERF_ALLOW_WRITES: '1',
        BASE_URL: 'http://127.0.0.1:3000',
        ARTILLERY_WS_URL: 'ws://127.0.0.1:3000/ws',
        ALLOWED_ORIGIN: 'http://127.0.0.1:3000',
        PERF_DB_NAME: 'chatapp_perf_artillery',
        PERF_TEST_PASSWORD: '',
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('PERF_TEST_PASSWORD must be set explicitly.');
    expect(result.stderr).not.toContain('http://127.0.0.1:3000');
  });
});
