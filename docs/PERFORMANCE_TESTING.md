# Performance and Load Testing (CA-45)

This procedure maps to the SRS performance requirements and Test Plan cases TC-PERF-01 to TC-PERF-03. The benchmark creates test accounts, private conversations, and messages. **Use a disposable MongoDB database only. Do not run it against a production or shared database.**

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
| PERF-1 — 95% within 500 ms on LAN / 1,000 ms on broadband | Run `npm run perf:full` separately from a client on the LAN and a client on the broadband path. Set `BASE_URL` to the server's LAN address for LAN evidence and its approved reachable test endpoint for broadband evidence. Set `PERF_LATENCY_TARGET_MS` to `500` for the LAN run and `1000` for the broadband run; set `ALLOWED_ORIGIN` on both server and runner to the same allowed Origin. The report's delivery latency starts immediately before the sender WebSocket write and ends at the first recipient `message:new` event. Save both JSON outputs and record network type, date, and client/server locations. Do not use `127.0.0.1`, `localhost`, or another loopback route as network-path evidence. For public network tests, use an approved TLS-protected test deployment and test-only credentials. |
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

The 2026-10-30 automated run is recorded in `docs/PERFORMANCE_TEST_RESULTS.md`. It was performed on a 15.61 GiB host using loopback, so it does not establish the SRS 2 GB environment requirement or separate LAN/broadband latency. CA-45 must remain open until the 100-client run is repeated in the specified 2 GB environment and message latency is checked over a separate LAN/broadband path.
