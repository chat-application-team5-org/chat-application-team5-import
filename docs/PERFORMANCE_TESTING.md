# Performance and Load Testing (CA-45)

This procedure maps to the SRS performance requirements and Test Plan cases TC-PERF-01 to TC-PERF-03. The benchmark creates test accounts, private conversations, and messages. **Use a disposable MongoDB database only. Do not run it against a production or shared database.**

## Artillery WebSocket messaging test

`scripts/performance-artillery.yml` exercises this application's native WebSocket protocol. Each virtual user opens one connection to `/ws`, sends the `auth` event with a bearer JWT, waits for `auth:ok`, then sends `message:send` events in an authenticated private conversation. The fixture helper creates 100 test accounts and 50 private conversations through the existing REST API, pairing two virtual users per conversation. No application code or protocol has been changed.

This test writes users, conversations, and messages. It does not clear them afterward. Use only a freshly verified disposable database. The fixture helper requires `PERF_ALLOW_WRITES=1` and `PERF_DB_NAME=chatapp_perf_artillery`; the database name variable is an operator declaration, not a server-side verification. The helper's health check confirms the app is connected but cannot identify the database selected by the running server. Confirm the server's `MONGO_URI` points to the disposable database and verify its collections are empty before preparing fixtures. The generated `scripts/.ca45-artillery-chat-users.csv` file contains test JWTs; it is ignored by Git and must be deleted after the run.

### PowerShell commands

In the terminal that starts the application, point it at the dedicated database and use the same HTTP origin that the load generator will send:

```powershell
$env:MONGO_URI = "mongodb://127.0.0.1:27017/chatapp_perf_artillery"
$env:JWT_SECRET = "local-performance-test-secret-change-me"
$env:ALLOWED_ORIGIN = "http://localhost:3000"
npm start
```

Before proceeding, verify the database is empty with a read-only check. For a local MongoDB server with `mongosh`, for example:

```powershell
mongosh "mongodb://127.0.0.1:27017/chatapp_perf_artillery" --quiet --eval "printjson(db.getCollectionNames())"
```

Do not continue if it prints any existing collection names. On a separate load-generator terminal in the repository, prepare the 100 test users/conversations and run the Artillery script:

```powershell
$env:BASE_URL = "http://localhost:3000"
$env:ARTILLERY_WS_URL = "ws://localhost:3000/ws"
$env:ALLOWED_ORIGIN = "http://localhost:3000"
$env:PERF_DB_NAME = "chatapp_perf_artillery"
$env:PERF_ALLOW_WRITES = "1"
node scripts/prepare-artillery-chat.js
npx --yes artillery@2.0.34 run scripts/performance-artillery.yml --output docs/ca45-artillery-chat-2026-11-18.json
Remove-Item -LiteralPath scripts/.ca45-artillery-chat-users.csv
```

For a remote server, change `BASE_URL`, `ARTILLERY_WS_URL`, and `ALLOWED_ORIGIN` to the server's reachable address and exact permitted HTTP origin. Keep the URL path `/ws`. Artillery creates 100 virtual users over a one-second arrival phase; each authenticates and sends 120 messages at five-second intervals, keeping the 100 WebSocket sessions open for about ten minutes. The test does not send `message:ack` or `message:read`, so it exercises authenticated sending and `message:new` broadcasts but does not validate delivery acknowledgements or read receipts. Its built-in WebSocket counters report sent/received frames, but they do not correlate every `message:status` and recipient `message:new` by message ID or calculate the PERF-1 latency percentile. Use the existing `scripts/performance-test.js` for delivery-loss and latency percentile acceptance evidence. Adding this Artillery script is not a test result; run it on a disposable database before reporting measured results.

## Targets from the SRS

| Requirement | Acceptance target | How this repository checks it |
|---|---|---|
| PERF-1: send-to-display latency | At least 95% of messages at or below 500 ms on a local network; use 1,000 ms for typical broadband | Script records the first recipient `message:new` arrival after the sender's WebSocket send |
| PERF-2: concurrent connections | 100 simultaneous WebSocket clients without message loss | Script maintains 100 open clients; each sends a message every 5 seconds during the load interval |
| PERF-3: authentication time | Registration and login within 2 seconds | Script records each REST response time, including 20 additional registration/login probes during the load phase in the full run |
| PERF-4: history load | Latest 50 messages within 1 second | Script primes each test conversation with at least 50 messages, then times the history request |
| PERF-5: initial page load | Initial page usable within 3 seconds on a 4 Mbps connection | Manual Chrome DevTools check in the final section; the Node.js script cannot accurately emulate browser rendering and a throttled 4 Mbps connection |

## Automated smoke check

GitHub Actions runs `npm run perf:smoke` after starting the server against its own temporary MongoDB database. It uses 100 WebSocket connections for a short 15-second smoke test. This is a regression check; it does **not** replace the full 10-minute run on the target test machine.

The benchmark writes users, conversations, and messages. It refuses to start unless `PERF_ALLOW_WRITES=1` is set. Set that flag only when the server uses a disposable database. The benchmark never drops a database and does not clean up its test records.

## Run the full 10-minute test on Windows

1. Make sure Node.js 20+ and MongoDB are running.
2. In PowerShell, open the repository directory. In a dedicated terminal, set the application to use a disposable database and a test-only JWT secret, then start the server:

   ```powershell
   $env:MONGO_URI = "mongodb://127.0.0.1:27017/chatapp_perf_local"
   $env:JWT_SECRET = "local-performance-test-secret-change-me"
   $env:ALLOWED_ORIGIN = "http://localhost:3000"
   npm start
   ```

   Leave this terminal open. Check `http://localhost:3000/health` and make sure the database state is `connected`.

3. Open a second PowerShell terminal in the same repository directory and run:

   ```powershell
   $env:BASE_URL = "http://127.0.0.1:3000"
   $env:ALLOWED_ORIGIN = "http://localhost:3000"
   $env:PERF_LATENCY_TARGET_MS = "500"
   $env:PERF_ALLOW_WRITES = "1"
   npm run perf:full
   ```

   The full run uses 20 distinct users, 100 simultaneous WebSocket sessions, a 10-minute load interval, and 20 extra registration/login probes while messages continue to flow. It prints a JSON report containing the host details, authentication timings, latency percentile, missing acknowledgements/deliveries, history timing and target checks.

   For a typical broadband test, change the latency target to `1000` ms before running. Record which target was used; do not compare a broadband run against the 500 ms local-network target.

4. Save the final JSON output as project evidence and record the actual machine/RAM, run date, test target and outcome. Do not mark PERF-1 to PERF-4 as passed if the JSON report says a target failed.

The test creates uniquely named accounts and persists messages in the configured database. It does not delete them automatically. Use a fresh disposable database for each full run, never a production/shared database. When finished, stop the app; remove only the disposable database if desired.

## Reproducible procedure by requirement

| Requirement | How to run and what to record |
|---|---|
| PERF-1 — 95% within 500 ms on LAN / 1,000 ms on broadband | Run `npm run perf:full` separately from a client on the LAN and a client on the broadband path. The load generator must run on a separate device from the server; targeting the server laptop's own Wi-Fi address from that laptop is not separate-device LAN evidence, and opening the page in a phone browser does not run this Node.js load generator. Set `BASE_URL` to the server's LAN address for LAN evidence and its approved reachable test endpoint for broadband evidence. Set `PERF_LATENCY_TARGET_MS` to `500` for the LAN run and `1000` for the broadband run; set `ALLOWED_ORIGIN` on both server and runner to the same allowed Origin. The report's delivery latency starts immediately before the sender WebSocket write and ends at the first recipient `message:new` event. Save both JSON outputs and record network type, date, and client/server locations. Do not use `127.0.0.1`, `localhost`, or another loopback route as network-path evidence. For public network tests, use an approved TLS-protected test deployment and test-only credentials. |
| PERF-2 — 100 connections without loss in the SRS 2 GB environment | Run the server and its disposable test database in the SRS 2 GB target environment. Prefer running the benchmark from a separate load-generator machine to avoid consuming the target server's limited RAM. Use the full command above (100 clients, 600 seconds). On the server, record RAM with `(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB` (Windows) or `free -b` plus the VM/container limit (Linux). During the run, sample server CPU and available memory using the Windows `Get-Counter` command below or `pidstat -u -r -p <server-pid> 1` on Linux. JSON `benchmarkHostUsage` describes the benchmark-process host, not a remote server. Require 100 clients, zero unexpected closes/skipped sends, zero missing acknowledgements, and zero missing recipient deliveries. |
| PERF-3 — registration and login within 2 seconds | The full run records initial account registration/login requests and `AUTH_PROBES` extra probes during message load. Verify `registration.maxMs` and `login.maxMs` are each at most `2000`, with corresponding checks passing. |
| PERF-4 — load 50 messages within 1 second | The full run primes each measured private conversation with at least 50 messages, then requests the latest 50. Verify `history50.p95Ms <= 1000`, `history50.samples > 0`, and that each response contains exactly 50 messages. The measured time includes the authenticated HTTP request. |
| PERF-5 — page load within 3 seconds at 4 Mbps | In Chrome DevTools, disable cache and configure a custom Network profile with 4 Mbps download and upload; record latency. Open Performance settings and enable screenshots, then record a reload. For each of five runs, measure from navigation start to the first captured frame where the login form is visible and enabled for input. Record the five readiness times and maximum; pass only if all are <=3,000 ms. Save the Performance recording/screenshot. Network `Finish` alone is not the readiness result. |

To capture Windows server CPU and available-memory samples during PERF-2, run this in a PowerShell window on the server before starting the benchmark; stop it with Ctrl+C after the benchmark ends:

```powershell
Get-Counter '\Processor(_Total)\% Processor Time','\Memory\Available MBytes' -SampleInterval 1 |
  ForEach-Object { $_.CounterSamples } |
  Select-Object Timestamp, Path, CookedValue |
  Export-Csv -Path .\ca45-server-resources.csv -NoTypeInformation
```

The integration test in `tests/integration/messaging.integration.test.js` drops its selected database before and after the test. It rejects database names other than `chatapp_test` or `chatapp_test_<suffix>`. Run it only with a dedicated disposable local MongoDB database; do not point `MONGO_URI` at shared or production data.

The `perf:full` command is `node scripts/performance-test.js --duration=600 --users=20 --clients=100 --auth-probes=20`. `perf:smoke` is a short regression test, not evidence for the 10-minute or target-environment requirements. The benchmark defaults `BASE_URL` to localhost, so set it explicitly for every remote test.

## Historical PERF-5 Network Finish proxy — 2026-10-30 (not visible-readiness evidence)

The initial chat application login page was opened in Chrome. DevTools Network was used with cache disabled and a custom throttle profile set to 4 Mbps download, 4 Mbps upload, and 0 ms added latency. Five reloads were recorded using the Network panel's **Finish** timing.

| Reload | Network Finish |
|---:|---:|
| 1 | 212 ms |
| 2 | 191 ms |
| 3 | 185 ms |
| 4 | 206 ms |
| 5 | 182 ms |
| Average | 195.2 ms |
| Median | 191 ms |
| Maximum | 212 ms |

All five Finish timings were below the 3,000 ms target. This is a recorded page-load timing proxy for the configured browser test; it is not a separate automated interaction-readiness or field-user measurement.

## Results record

| Date / environment | Run mode | Clients / duration | Latency target and p95 | Missing messages | Registration/login max | History p95 | PERF-5 at 4 Mbps | Overall |
|---|---|---:|---|---:|---|---|---|---|
| 2026-10-30; loopback on 15.61 GiB host | Full automated run | 100 / 600 seconds | 500 ms; p50 104.72 ms, p95 161.19 ms, p99 237.22 ms; 99.99% within 500 ms | 0 of 60,000 expected recipient deliveries missing; 0 missing acknowledgements | 189.30 ms / 85.28 ms | 72.77 ms | Chrome Finish: 212 / 191 / 185 / 206 / 182 ms at 4 Mbps | **Partially verified** — 2 GB environment and separate LAN/broadband latency remain pending |
| 2026-11-17; app and MongoDB in WSL2 (2 GB), Windows load generator | Full automated run | 100 / 600 seconds | 500 ms target; p50 156.18 ms, p95 249.03 ms, p99 287.33 ms; 100% within 500 ms on localhost forwarding | 0 of 60,000 expected recipient deliveries missing; 0 missing acknowledgements | 272.71 ms / 90.06 ms | 45.69 ms | Not measured | **PERF-2 PASS** — server and DB resource samples recorded; PERF-1 path evidence and PERF-5 visible readiness pending |

The 2026-10-30 automated run is recorded in `docs/PERFORMANCE_TEST_RESULTS.md`. It used loopback on a 15.61 GiB host, so it did not establish the 2 GB environment requirement. The 2026-11-17 WSL2 run now verifies PERF-2; its localhost-forwarded latency does not establish separate LAN/broadband performance. CA-45 remains open until PERF-1 is measured over separate LAN and broadband paths and PERF-5 visible readiness is measured in Chrome DevTools.
