#!/usr/bin/env node
/* Prepares 100 API-authenticated private-chat fixtures for performance-artillery.yml.
 * This writes test users and conversations to the configured server database.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const USER_COUNT = 100;
const FIXTURE_PATH = path.join(__dirname, '.ca45-artillery-chat-users.csv');
const REQUEST_TIMEOUT_MS = 15000;

function requiredEnv(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${name} must be set explicitly.`);
  }
  return value.trim();
}

function validateSettings() {
  if (process.env.PERF_ALLOW_WRITES !== '1') {
    throw new Error('This helper creates 100 users and 50 conversations. Set PERF_ALLOW_WRITES=1 only for a confirmed disposable database.');
  }

  const baseUrl = new URL(requiredEnv('BASE_URL'));
  const wsUrl = new URL(requiredEnv('ARTILLERY_WS_URL'));
  const allowedOrigin = requiredEnv('ALLOWED_ORIGIN');
  const databaseName = requiredEnv('PERF_DB_NAME');

  if (!['http:', 'https:'].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
    throw new Error('BASE_URL must be an HTTP(S) origin/path without credentials, query, or fragment.');
  }
  if (!['ws:', 'wss:'].includes(wsUrl.protocol) || wsUrl.username || wsUrl.password || wsUrl.search || wsUrl.hash) {
    throw new Error('ARTILLERY_WS_URL must be a ws(s) URL without credentials, query, or fragment.');
  }
  const expectedProtocol = baseUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  if (wsUrl.protocol !== expectedProtocol || wsUrl.host !== baseUrl.host || wsUrl.pathname !== '/ws') {
    throw new Error('ARTILLERY_WS_URL must use the same host as BASE_URL and the application /ws path.');
  }
  if (allowedOrigin !== baseUrl.origin) {
    throw new Error('ALLOWED_ORIGIN must exactly match the origin portion of BASE_URL.');
  }
  if (databaseName !== 'chatapp_perf_artillery') {
    throw new Error('PERF_DB_NAME must explicitly be chatapp_perf_artillery for this test fixture helper.');
  }
  const password = requiredEnv('PERF_TEST_PASSWORD');
  if (fs.existsSync(FIXTURE_PATH)) {
    throw new Error(`Refusing to overwrite existing fixture file: ${FIXTURE_PATH}`);
  }

  return { baseUrl: baseUrl.origin + baseUrl.pathname.replace(/\/$/, ''), databaseName, password };
}

async function requestJson(baseUrl, route, { method = 'GET', token, body } = {}) {
  const response = await fetch(baseUrl + route, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  let data = null;
  try {
    data = response.status === 204 ? null : await response.json();
  } catch {
    // Keep response contents (which may contain implementation details) out of errors.
  }
  if (!response.ok) {
    const code = data && data.error && data.error.code;
    throw new Error(`${method} ${route} failed with HTTP ${response.status}${code ? ` (${code})` : ''}.`);
  }
  return data;
}

function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

async function main() {
  const { baseUrl, databaseName, password } = validateSettings();
  const health = await requestJson(baseUrl, '/health');
  if (!health || health.status !== 'ok' || health.db !== 'connected') {
    throw new Error('The application health check did not report a connected database; no fixtures were created.');
  }

  const runId = crypto.randomBytes(5).toString('hex');
  const usernamePrefix = `art${runId}`;
  const users = [];

  for (let index = 0; index < USER_COUNT; index += 1) {
    const username = `${usernamePrefix}_${String(index).padStart(3, '0')}`;
    const registered = await requestJson(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: { username, email: `${username}@example.test`, password },
    });
    const loggedIn = await requestJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { identifier: username, password },
    });
    users.push({ username, userId: registered.userId, token: loggedIn.token });
  }

  const rows = [];
  for (let index = 0; index < USER_COUNT; index += 2) {
    const conversationResponse = await requestJson(baseUrl, '/api/conversations', {
      method: 'POST',
      token: users[index].token,
      body: { participantId: users[index + 1].userId },
    });
    const conversationId = conversationResponse && conversationResponse.conversation
      && conversationResponse.conversation._id;
    if (!conversationId) throw new Error(`Conversation fixture ${index / 2 + 1} was not returned.`);
    rows.push(users[index], users[index + 1]);
    users[index].conversationId = String(conversationId);
    users[index + 1].conversationId = String(conversationId);
  }

  const csv = [
    'token,conversationId,username',
    ...rows.map((user) => [user.token, user.conversationId, user.username].map(csvCell).join(',')),
  ].join('\n') + '\n';
  fs.writeFileSync(FIXTURE_PATH, csv, { flag: 'wx', mode: 0o600 });
  process.stdout.write(`Prepared ${rows.length} private-chat fixtures in ${path.basename(FIXTURE_PATH)} for declared disposable database ${databaseName}.\n`);
  process.stdout.write('The fixture file contains test JWTs. Do not commit or share it; remove it after the Artillery run.\n');
}

main().catch((error) => {
  process.stderr.write(`Artillery fixture preparation failed: ${error.message}\n`);
  process.exitCode = 1;
});
