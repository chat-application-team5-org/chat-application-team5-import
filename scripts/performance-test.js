#!/usr/bin/env node
/* Performance harness for the SRS PERF-1..PERF-4 requirements.
 * Run only against a disposable database; this creates users, chats and messages.
 */
const { once } = require('node:events');
const { performance } = require('node:perf_hooks');
const os = require('node:os');
const WebSocket = require('ws');

const BASE_URL = (process.env.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const WS_URL = BASE_URL.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:') + '/ws';
const DURATION_SECONDS = readOption('duration', 600);
const USERS = readOption('users', 20);
const CLIENTS = readOption('clients', 100);
const AUTH_PROBES = readOption('auth-probes', 20);
const LATENCY_TARGET_MS = Number(process.env.PERF_LATENCY_TARGET_MS || 500);
const PAGE_TARGET_MS = 1000;
const AUTH_TARGET_MS = 2000;
const PASSWORD = 'PerfCheck123';
const runId = Date.now().toString(36);
const records = new Map();
const activeSockets = new Set();
const registrationTimes = [];
const loginTimes = [];
const historyTimes = [];
let loadActive = false;
let unexpectedCloses = 0;
let skippedSends = 0;
let sentSequence = 0;

function readOption(name, fallback) {
  const prefix = '--' + name + '=';
  const arg = process.argv.find((item) => item.startsWith(prefix));
  if (!arg) return fallback;
  const value = Number.parseInt(arg.slice(prefix.length), 10);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('Option ' + name + ' must be a positive integer.');
  }
  return value;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function percentile(values, pct) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.max(0, Math.ceil(pct * sorted.length) - 1)].toFixed(2));
}

function maxValue(values) {
  return values.length ? Number(Math.max(...values).toFixed(2)) : null;
}

async function requestJson(path, { method = 'GET', token, body } = {}) {
  const started = performance.now();
  const response = await fetch(BASE_URL + path, {
    method,
    headers: {
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  let data = null;
  try {
    data = response.status === 204 ? null : await response.json();
  } catch {
    // A non-JSON response is handled as an HTTP/API error below.
  }
  const elapsedMs = performance.now() - started;
  if (!response.ok) {
    const message = data && data.error && data.error.message;
    throw new Error(method + ' ' + path + ' returned HTTP ' + response.status + ': ' + (message || 'request failed'));
  }
  return { data, elapsedMs };
}

async function provisionUsers(count, prefix) {
  const users = [];
  for (let index = 0; index < count; index += 1) {
    const username = prefix + '_' + String(index).padStart(3, '0');
    const registered = await requestJson('/api/auth/register', {
      method: 'POST',
      body: { username, email: username + '@example.test', password: PASSWORD },
    });
    registrationTimes.push(registered.elapsedMs);
    const loggedIn = await requestJson('/api/auth/login', {
      method: 'POST',
      body: { identifier: username, password: PASSWORD },
    });
    loginTimes.push(loggedIn.elapsedMs);
    users.push({
      userId: registered.data.userId,
      username,
      token: loggedIn.data.token,
    });
  }
  return users;
}

function recordIsComplete(record) {
  return record.acked && record.deliveries >= record.expectedDeliveries;
}

function maybeComplete(record) {
  if (!record.completed && recordIsComplete(record)) {
    record.completed = true;
    if (record.finish) record.finish();
  }
}

function handleServerEvent(event) {
  const payload = event.payload || {};
  if (event.type === 'message:status' && payload.clientMsgId) {
    const record = records.get(payload.clientMsgId);
    if (record && !record.acked) {
      record.acked = true;
      maybeComplete(record);
    }
  } else if (event.type === 'message:new' && payload.message && payload.message.clientMsgId) {
    const record = records.get(payload.message.clientMsgId);
    if (record && record.deliveries < record.expectedDeliveries) {
      record.deliveries += 1;
      if (record.firstDeliveryAt === null) {
        record.firstDeliveryAt = performance.now();
        record.latencyMs = record.firstDeliveryAt - record.startedAt;
      }
      maybeComplete(record);
    }
  } else if (event.type === 'error' && payload.clientMsgId) {
    const record = records.get(payload.clientMsgId);
    if (record) record.error = payload.code || 'WEBSOCKET_ERROR';
  }
}

async function connectSocket(user) {
  const socket = new WebSocket(WS_URL);
  let authenticated = false;
  let resolveAuth;
  let rejectAuth;
  const authReady = new Promise((resolve, reject) => {
    resolveAuth = resolve;
    rejectAuth = reject;
  });
  const authTimer = setTimeout(() => {
    if (!authenticated) rejectAuth(new Error('Timed out authenticating a performance WebSocket client.'));
  }, 5000);

  socket.on('message', (raw) => {
    let event;
    try {
      event = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!authenticated) {
      if (event.type === 'auth:ok') {
        authenticated = true;
        clearTimeout(authTimer);
        resolveAuth();
      } else if (event.type === 'error') {
        clearTimeout(authTimer);
        rejectAuth(new Error('WebSocket authentication failed: ' + (event.payload && event.payload.message)));
      }
      return;
    }
    handleServerEvent(event);
  });

  socket.on('error', (error) => {
    if (!authenticated) {
      clearTimeout(authTimer);
      rejectAuth(error);
    }
  });
  socket.on('close', () => {
    activeSockets.delete(socket);
    if (loadActive) unexpectedCloses += 1;
  });

  try {
    await once(socket, 'open');
    socket.send(JSON.stringify({ type: 'auth', payload: { token: user.token } }));
    await authReady;
    activeSockets.add(socket);
    return socket;
  } catch (error) {
    clearTimeout(authTimer);
    socket.terminate();
    throw error;
  }
}

function newRecord(client, phase) {
  const clientMsgId = 'perf-' + runId + '-' + client.index + '-' + (++sentSequence);
  const record = {
    clientMsgId,
    phase,
    startedAt: performance.now(),
    expectedDeliveries: client.expectedDeliveries,
    acked: false,
    deliveries: 0,
    firstDeliveryAt: null,
    latencyMs: null,
    completed: false,
    finish: null,
    error: null,
  };
  records.set(clientMsgId, record);
  return record;
}

function waitForRecord(record, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for acknowledgement and recipient delivery.')), timeoutMs);
    record.finish = () => {
      clearTimeout(timer);
      resolve();
    };
    if (record.completed) record.finish();
  });
}

function sendOne(client, phase, waitForDelivery = false) {
  if (client.socket.readyState !== WebSocket.OPEN) {
    skippedSends += 1;
    return waitForDelivery
      ? Promise.reject(new Error('A WebSocket client disconnected during the performance test.'))
      : Promise.resolve(null);
  }

  const record = newRecord(client, phase);
  const completed = waitForDelivery ? waitForRecord(record) : null;
  client.socket.send(JSON.stringify({
    type: 'message:send',
    payload: {
      conversationId: client.conversationId,
      content: 'Performance test message ' + sentSequence,
      clientMsgId: record.clientMsgId,
    },
  }));
  return completed ? completed.then(() => record) : Promise.resolve(record);
}

function assertOptions() {
  if (USERS < 2 || USERS % 2 !== 0) throw new Error('--users must be an even number of at least 2.');
  if (CLIENTS < USERS || CLIENTS % USERS !== 0) {
    throw new Error('--clients must be at least --users and evenly divisible by --users.');
  }
  if (AUTH_PROBES < 1) throw new Error('--auth-probes must be positive.');
  if (DURATION_SECONDS < 1 || LATENCY_TARGET_MS <= 0) throw new Error('Duration and latency target must be positive.');
}

async function main() {
  assertOptions();
  const prefix = 'p' + runId.slice(-7);
  const users = await provisionUsers(USERS, prefix);
  const conversations = [];

  for (let index = 0; index < users.length; index += 2) {
    const opened = await requestJson('/api/conversations', {
      method: 'POST',
      token: users[index].token,
      body: { participantId: users[index + 1].userId },
    });
    conversations.push(String(opened.data.conversation._id));
  }

  const clientsPerUser = CLIENTS / USERS;
  const clients = [];
  for (let index = 0; index < CLIENTS; index += 1) {
    const userIndex = Math.floor(index / clientsPerUser);
    const socket = await connectSocket(users[userIndex]);
    clients.push({
      index,
      userIndex,
      socket,
      conversationId: conversations[Math.floor(userIndex / 2)],
      expectedDeliveries: clientsPerUser,
    });
  }

  // Prime every conversation with at least 50 messages before timing history reads.
  for (let convIndex = 0; convIndex < conversations.length; convIndex += 1) {
    const sender = clients.find((client) => client.userIndex === convIndex * 2);
    for (let index = 0; index < 50; index += 1) {
      await sendOne(sender, 'warmup', true);
    }
  }

  loadActive = true;
  clients.forEach((client) => sendOne(client, 'load'));
  const interval = setInterval(() => {
    clients.forEach((client) => sendOne(client, 'load'));
  }, 5000);

  let probeError = null;
  const authProbeWork = (async () => {
    try {
      await provisionUsers(AUTH_PROBES, prefix + 'x');
    } catch (error) {
      probeError = error;
    }
  })();

  await Promise.all([delay(DURATION_SECONDS * 1000), authProbeWork]);
  clearInterval(interval);
  loadActive = false;
  await delay(5000);

  for (let convIndex = 0; convIndex < conversations.length; convIndex += 1) {
    const started = performance.now();
    const result = await requestJson(
      '/api/conversations/' + encodeURIComponent(conversations[convIndex]) + '/messages?limit=50',
      { token: users[convIndex * 2].token }
    );
    historyTimes.push(performance.now() - started);
    if (!Array.isArray(result.data.messages) || result.data.messages.length !== 50) {
      throw new Error('History test expected exactly 50 messages for conversation ' + (convIndex + 1) + '.');
    }
  }

  const loadRecords = [...records.values()].filter((record) => record.phase === 'load');
  const missingAcks = loadRecords.filter((record) => !record.acked || record.error).length;
  const missingDeliveries = loadRecords.filter((record) => record.deliveries !== record.expectedDeliveries).length;
  const latencyUnderTarget = loadRecords.filter((record) => record.latencyMs !== null && record.latencyMs <= LATENCY_TARGET_MS).length;
  const latencyPercent = loadRecords.length ? Number((latencyUnderTarget * 100 / loadRecords.length).toFixed(2)) : 0;
  const latencyP95 = percentile(loadRecords.filter((record) => record.latencyMs !== null).map((record) => record.latencyMs), 0.95);
  const registrationMax = maxValue(registrationTimes);
  const loginMax = maxValue(loginTimes);
  const historyP95 = percentile(historyTimes, 0.95);
  const connectedClients = clients.filter((client) => client.socket.readyState === WebSocket.OPEN).length;

  const report = {
    runId,
    system: {
      platform: os.platform(),
      release: os.release(),
      nodeVersion: process.version,
      totalMemoryGiB: Number((os.totalmem() / (1024 ** 3)).toFixed(2)),
    },
    baseUrl: BASE_URL,
    durationSeconds: DURATION_SECONDS,
    distinctUsers: USERS,
    authProbeUsers: AUTH_PROBES,
    simultaneousWebSocketClients: CLIENTS,
    registration: { samples: registrationTimes.length, maxMs: registrationMax, p95Ms: percentile(registrationTimes, 0.95) },
    login: { samples: loginTimes.length, maxMs: loginMax, p95Ms: percentile(loginTimes, 0.95) },
    messageDelivery: {
      loadMessagesSent: loadRecords.length,
      acknowledgementsMissingOrRejected: missingAcks,
      messagesMissingExpectedRecipientDelivery: missingDeliveries,
      latencySamples: loadRecords.filter((record) => record.latencyMs !== null).length,
      withinTargetPercent: latencyPercent,
      p95Ms: latencyP95,
      targetMs: LATENCY_TARGET_MS,
      unexpectedWebSocketCloses: unexpectedCloses,
      skippedSends: skippedSends,
    },
    history50: { samples: historyTimes.length, p95Ms: historyP95, targetMs: PAGE_TARGET_MS },
    browserPageLoad: 'Not measured by this script; follow docs/PERFORMANCE_TESTING.md with Chrome DevTools throttled to 4 Mbps.',
  };

  const checks = {
    allClientsStayedConnected: connectedClients === CLIENTS && unexpectedCloses === 0,
    registrationWithinTwoSeconds: registrationMax !== null && registrationMax <= AUTH_TARGET_MS,
    loginWithinTwoSeconds: loginMax !== null && loginMax <= AUTH_TARGET_MS,
    atLeast95PercentMessagesWithinLatencyTarget: latencyPercent >= 95,
    noMissingAcknowledgementsOrDeliveries: missingAcks === 0 && missingDeliveries === 0 && skippedSends === 0,
    history50WithinOneSecond: historyP95 !== null && historyP95 <= PAGE_TARGET_MS,
    authProbeRegistrationAndLoginPassed: !probeError,
  };
  report.checks = checks;
  report.passed = Object.values(checks).every(Boolean);
  console.log(JSON.stringify(report, null, 2));

  clients.forEach((client) => client.socket.close());
  if (probeError) throw probeError;
  if (!report.passed) throw new Error('One or more performance targets failed; inspect the JSON report.');
}

main().catch((error) => {
  activeSockets.forEach((socket) => socket.terminate());
  console.error('Performance test failed:', error.message);
  process.exitCode = 1;
});
