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

## Manual PERF-5 browser check

1. Open the app in current Chrome and press **F12** to open DevTools.
2. Select **Network** and disable cache while DevTools is open.
3. Create/use a custom network throttling profile with a **4 Mbps download** rate; apply it and reload the page.
4. Record the page-load timing from the Network panel. Repeat five times.
5. Record all five results and whether the initial page was usable within 3 seconds. The Node.js benchmark does not claim PERF-5 passed.

## Results record

| Date / environment | Run mode | Clients / duration | Latency target and p95 | Missing messages | Registration/login max | History p95 | PERF-5 at 4 Mbps | Overall |
|---|---|---:|---|---:|---|---|---|---|
| Pending full run | GitHub Actions smoke only; full SRS run not yet recorded | 100 / 15 seconds in CI smoke | Use CI log report; not a 10-minute target run | Use CI log report | Use CI log report | Use CI log report | Not measured by CI smoke | **Not yet complete** |

CA-45 should remain open until the full performance run and the manual PERF-5 check have been recorded and reviewed.
