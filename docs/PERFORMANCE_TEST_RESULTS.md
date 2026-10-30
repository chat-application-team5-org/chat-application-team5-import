# CA-45 Performance and Load Test Results

**Date:** 2026-10-30  
**Status:** Partially verified — PERF-5 measurements recorded; PERF-1 network-path validation and PERF-2 2 GB validation remain open  
**Issue:** [#40 — Performance and load tests](https://github.com/chat-application-team5-org/chat-application-team5-import/issues/40)  
**Branch:** `test/CA-45-full-performance-validation-recovery`

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

CPU and host details should be captured by the enhanced benchmark output on the next run. Do not infer CPU utilization from process CPU time.

## 5. Outstanding acceptance checks

| Requirement | Status | Next action |
|---|---|---|
| PERF-1 — message delivery latency | Partially verified | Repeat over a separate LAN/broadband path; current numbers are loopback |
| PERF-2 — 100 concurrent clients | Partially verified | Repeat on the SRS-specified 2 GB environment |
| PERF-3 — registration/login | PASS in this run | Retain recorded maxima |
| PERF-4 — latest 50 messages | PASS in this run | Retain recorded p95 |
| PERF-5 — initial page usable within 3 seconds at 4 Mbps | PASS for five recorded Network Finish readings | Five Chrome reloads with cache disabled and a custom 4 Mbps download / 4 Mbps upload profile: 212, 191, 185, 206, 182 ms (all below 3,000 ms) |

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

**CA-45 remains open.** PERF-5 has five recorded Chrome Network Finish measurements below the 3-second target. PERF-2 has not been repeated on the required 2 GB environment, and the automated loopback latency does not prove performance over a separate LAN/broadband path. Complete those remaining checks and obtain review before closing the issue.
