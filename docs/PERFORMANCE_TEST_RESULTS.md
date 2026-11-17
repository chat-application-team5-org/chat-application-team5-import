# CA-45 Performance and Load Test Results

**Date:** 2026-10-30  
**Status:** Partially verified — PERF-3/4 measurements and PERF-5 Network Finish readings recorded; separate-path PERF-1 and 2 GB PERF-2 evidence remain open
**Issue:** [#40 — Performance and load tests](https://github.com/chat-application-team5-org/chat-application-team5-import/issues/40)  
**Branch:** `test/CA-45-perf5-chrome-results`

## 1. Automated 10-minute run

| Item | Recorded result |
|---|---:|
| Run duration | 600 seconds |
| Simultaneous WebSocket clients | 100 |
| Expected recipient deliveries | 60,000 |
| Confirmed recipient deliveries | 60,000 |
| Missing recipient deliveries | 0 |
| Missing acknowledgements | 0 |
| Unexpected disconnects | 0 |
| Skipped sends | 0 |

**Automated load result: PASS** for this run and this host.

## 2. Latency and response-time measurements

| Measurement | Result | SRS target | Assessment |
|---|---:|---:|---|
| Message latency p50 | 104.72 ms | — | Recorded |
| Message latency p95 | 161.19 ms | At least 95% within 500 ms on LAN | Recorded |
| Message latency p99 | 237.22 ms | — | Recorded |
| Messages within 500 ms | 99.99% | At least 95% | PASS for loopback only |
| Registration maximum | 189.30 ms | 2,000 ms | PASS |
| Login maximum | 85.28 ms | 2,000 ms | PASS |
| Latest 50-message history p95 | 72.77 ms | 1,000 ms | PASS |

The message test used **loopback**. These measurements do not establish performance over a separate LAN or a broadband connection. The 500 ms comparison is therefore a local-loopback observation, not proof of a network-path result.

## 3. Test and quality checks

| Check | Result |
|---|---|
| `npm ci --no-audit --no-fund` | PASS |
| Unit tests | 11 suites, 81 tests passed |
| MongoDB integration test | 1 suite, 1 test passed using a separate disposable test database |
| Lint | PASS |
| `git diff --check` | PASS |

## 4. Environment limitation

The 100-client run was performed on a machine reporting **15.61 GiB RAM**. The SRS specifies a 2 GB environment for the concurrent-client requirement.

Therefore, the 100-client result is evidence that the application handled the workload on the tested machine, but it does **not** verify the 2 GB acceptance condition. Repeat the 100-client test in a 2 GB environment and record the actual available memory and result.

The current benchmark JSON samples host CPU utilization and host memory once per second during the load phase, and records the benchmark process's peak RSS. Those fields describe the machine running the benchmark script. If the application server is remote, record its CPU and memory independently; do not treat load-generator metrics as server evidence. Process CPU time is also reported but is not a substitute for CPU utilization.

## 5. Acceptance status

The status below applies to each acceptance criterion as written, not merely to a related measurement on another environment or a proxy metric.

| Requirement | Status | Existing evidence | Remaining evidence |
|---|---|---|---|
| PERF-1 — p95 <=500 ms on LAN and <=1,000 ms on broadband | **NOT RUN** | Loopback p95 161.19 ms and 99.99% within 500 ms; loopback is not LAN/broadband acceptance evidence | Run separately over LAN and broadband, save each JSON report, and record network details |
| PERF-2 — 100 clients, no loss, in 2 GB environment; record CPU/memory | **NOT RUN** | Historical 100-client, 600-second run: 60,000/60,000 deliveries on a 15.61 GiB host. It did not exercise the required 2 GB host. The old report does not include server CPU utilization or peak server memory. | Run with the application server in the 2 GB environment; record zero message loss and capture server-side CPU/memory during the run |
| PERF-3 — registration and login each <=2 seconds | **PASS** | Historical maximums: registration 189.30 ms; login 85.28 ms (2026-10-30 run) | None for the recorded run; retain original run output if available |
| PERF-4 — latest 50 messages <=1 second | **PASS** | Historical p95 72.77 ms (2026-10-30 run) | None for the recorded run; retain original run output if available |
| PERF-5 — visible page readiness <=3 seconds at 4 Mbps | **NOT RUN** | Five historical Chrome Network Finish values: 212, 191, 185, 206, 182 ms. These are proxy timings, not visible-readiness measurements. | Measure visible readiness in Chrome DevTools under a documented 4 Mbps throttle and record each run plus evidence |

## 6. PERF-5 manual Chrome results

**Date:** 2026-10-30  
**Browser:** Google Chrome DevTools Network panel  
**Network profile:** Custom 4 Mbps download / 4 Mbps upload; 0 ms added latency  
**Cache:** Disabled  
**Page tested:** Initial chat application login page  
**Recorded metric:** Network panel `Finish` time for each reload

| Reload | Network Finish |
|---:|---:|
| 1 | 212 ms |
| 2 | 191 ms |
| 3 | 185 ms |
| 4 | 206 ms |
| 5 | 182 ms |
| **Average** | **195.2 ms** |
| **Median** | **191 ms** |
| **Maximum** | **212 ms** |

All five recorded Network Finish times were below the 3,000 ms target. This is evidence for the initial page-load check under the configured Chrome throttle. The recorded measure is the Network panel's Finish timing; it is not a separate automated interaction-readiness or field-user measurement.

## 7. Conclusion

The automated 600-second run completed with 100 WebSocket clients and 60,000 of 60,000 expected recipient deliveries. Registration, login, and latest-50 history timings met their numerical targets in this run. Unit tests, integration tests, lint, and diff checks passed.

**CA-45 remains incomplete.** PERF-3 and PERF-4 have historical passing measurements. PERF-1, PERF-2, and PERF-5 remain **NOT RUN** against their full acceptance criteria. No new LAN, broadband, 2 GB, or visible-readiness result is claimed in this report.

## 8. Final-acceptance code verification — 2026-11-17

These checks validate the repository changes; they are not performance measurements.

| Check | Result |
|---|---|
| Focused performance safety/resource tests | 2 suites, 3 tests passed |
| Full Jest suite | 27 suites, 191 tests passed |
| `npm run lint` | PASS |
| `node --check` on changed JavaScript files | PASS |
| `git diff --check` | PASS |
| MongoDB integration suite | NOT RUN — `MONGO_URI` was unset, Docker was unavailable, and no local MongoDB listener was present. The suite drops its configured database, so it was not run without a dedicated disposable database. |
| New LAN/broadband/2 GB/browser performance measurements | NOT RUN — those target environments and browser session were not available in this run. |
