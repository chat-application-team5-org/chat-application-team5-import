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

## Run the full 10-minute test on Windows

1. Make sure Node.js 20+ and MongoDB are running.
2. In PowerShell, open the repository directory. In a dedicated terminal, set the application to use a disposable database and a test-only JWT secret, then start the server:

   ```powershell
   $env:MONGO_URI = "mongodb://127.0.0.1:27017/chatapp_perf_local"
   $env:JWT_SECRET = "local-performance-test-secret-change-me"
   npm start
   ```

   Leave this terminal open. Check `http://localhost:3000/health` and make sure the database state is `connected`.

3. Open a second PowerShell terminal in the same repository directory and run:

   ```powershell
   $env:BASE_URL = "http://127.0.0.1:3000"
   $env:PERF_LATENCY_TARGET_MS = "500"
   npm run perf:full
   ```

   The full run uses 20 distinct users, 100 simultaneous WebSocket sessions, a 10-minute load interval, and 20 extra registration/login probes while messages continue to flow. It prints a JSON report containing the host details, authentication timings, latency percentile, missing acknowledgements/deliveries, history timing and target checks.

   For a typical broadband test, change the latency target to `1000` ms before running. Record which target was used; do not compare a broadband run against the 500 ms local-network target.

4. Save the final JSON output as project evidence and record the actual machine/RAM, run date, test target and outcome. Do not mark PERF-1 to PERF-4 as passed if the JSON report says a target failed.

The test creates uniquely named accounts and persists messages in the configured database. It does not delete them automatically. When finished, stop the app, confirm the database is disposable, and remove that test database if desired.

## Manual PERF-5 browser check — completed 2026-10-30

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
