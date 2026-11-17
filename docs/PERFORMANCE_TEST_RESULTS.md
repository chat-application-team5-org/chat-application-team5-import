# CA-45 Performance and Load Test Results

**Date:** 2026-10-30  
**Status:** Partially verified — PERF-2 passed in the 2 GB WSL environment on 2026-11-17; PERF-3/4 have passing measurements; separate-path PERF-1 and visible-readiness PERF-5 evidence remain open
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
| PERF-2 — 100 clients, no loss, in 2 GB environment; record CPU/memory | **PASS** | 2026-11-17 WSL2 run: 100 clients for 600 seconds; 60,000/60,000 recipient deliveries, zero missing acknowledgements, app and MongoDB inside the WSL memory cap. Server and database CPU/RSS were sampled each second; see section 10 and attached logs. | None for the recorded run |
| PERF-3 — registration and login each <=2 seconds | **PASS** | 2026-11-17 WSL run: 40 samples; registration max 272.71 ms, login max 90.06 ms. The 2026-10-30 historical results are retained above. | None for the recorded run |
| PERF-4 — latest 50 messages <=1 second | **PASS** | 2026-11-17 WSL run: latest-50 history p95 45.69 ms over 10 samples. The 2026-10-30 historical result is retained above. | None for the recorded run |
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

The 2026-10-30 automated run completed with 100 WebSocket clients and 60,000 of 60,000 expected recipient deliveries. The later 2026-11-17 run repeated the 600-second workload with the application and MongoDB inside the 2 GB WSL2 VM and the load generator outside it; it also completed with zero message loss and recorded server/database resource use.

**CA-45 remains incomplete.** PERF-2 is now verified for the 2 GB WSL2 environment, and PERF-3/4 have passing measurements. PERF-1 remains **NOT RUN** over separate LAN and broadband paths. PERF-5 remains **NOT RUN** for visible page readiness; the historical Network Finish timings are only proxy evidence.

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

## 9. Pre-setup environment verification — 2026-11-17

The following checks were performed before the approved isolated WSL setup. The later benchmark and resource results in section 10 supersede the pre-setup NOT RUN status for PERF-2.

| Check | Verified result |
|---|---|
| Full Jest suite | **PASS** — 27 suites, 191 tests passed (`npm test -- --runInBand`) |
| Lint | **PASS** — `npm run lint` |
| JavaScript syntax | **PASS** — `node --check` for `scripts/performance-test.js`, `scripts/performanceResources.js`, and `src/server.js` |
| Diff check | **PASS** — `git diff --check` |
| Windows MongoDB service | Running as `MongoDB`, port 27017 bound to `127.0.0.1`. Config reports `dbPath` at `C:\Program Files\MongoDB\Server\9.0\data`; no authorization setting or `--auth` argument was configured. No settings were changed. |
| `chatapp_perf_local` safety check | Read-only check found existing `conversations`, `messages`, `users`, and `conversationmembers` collections. Their contents were not inspected, and no writes were performed. This database was **not verified as disposable**, so the benchmark was not run against it. |
| WSL 2 GB environment | `.wslconfig` specifies `memory=2GB`; Ubuntu reported `MemTotal: 1,946,928 kB`. WSL had Node.js but no `mongod` binary or database listener; its cgroup `memory.max` reported `max`. The Windows MongoDB process is outside WSL, so the required server-plus-database 2 GB setup was not present. |
| Full 10-minute / 100-client benchmark | **NOT RUN at this pre-setup check** — the Windows `chatapp_perf_local` database was not verified as disposable, and WSL had no MongoDB binary. See section 10 for the later isolated run using a separate WSL database. |
| PERF-1 LAN/broadband | **NOT RUN** — no separate LAN or broadband test path was used. |
| PERF-5 visible page readiness | **NOT RUN** — no Chrome DevTools readiness measurement was performed. Historical Network Finish timings remain proxy evidence only. |

PERF-3 and PERF-4 were not remeasured in this pre-setup check. PERF-1 and PERF-5 remain open; PERF-2 was later measured as recorded in section 10.

## 10. Isolated WSL2 2 GB benchmark — 2026-11-17

The benchmark used a fresh WSL-only checkout from committed `main` at `bd748f3`, a separate MongoDB Community 9.0.8 process, a new WSL data directory, and the database `chatapp_perf_wsl`. The existing Windows MongoDB service and its `chatapp_perf_local` database were not used or modified. The database was checked empty before the write-enabled run. MongoDB listened only on WSL loopback `127.0.0.1:27018`; the application ran in WSL and the load generator ran on Windows via `127.0.0.1:3000`. The benchmark script does not hard-code a database name: it targets `BASE_URL`, while the application selects its database from `MONGO_URI`; the app was started with the new WSL database URI.

WSL `.wslconfig` set `memory=2GB`; Ubuntu reported 1,946,940 kB `MemTotal`, and MongoDB `hostInfo` reported a 1,901 MB memory limit. Both the application process and `mongod` ran inside WSL. MongoDB used a 0.35 GiB WiredTiger cache limit. During the 840 one-second process samples spanning application setup, benchmark, and completion, peak WSL memory used was 797.3 MiB, minimum available memory was 1,104.0 MiB, and swap use remained 0 MiB. Peak process readings were:

| WSL process | Peak CPU | Average CPU across capture window | Peak RSS |
|---|---:|---:|---:|
| Application (`node src/server.js`) | 91% | 6.44% | 129.9 MiB |
| MongoDB (`mongod`) | 29% | 2.55% | 217.8 MiB |

The full automated command ran for 600 seconds with 100 simultaneous WebSocket clients, 20 primary users, and 20 additional authentication probes. The load generator reported the following results:

| Measurement | Result | Assessment |
|---|---:|---|
| Load messages sent | 12,000 | 100 clients, 600 seconds |
| Expected / confirmed recipient deliveries | 60,000 / 60,000 | **PASS** |
| Missing deliveries / acknowledgements | 0 / 0 | **PASS** |
| Unexpected WebSocket closes / skipped sends | 0 / 0 | **PASS** |
| Message latency p50 / p95 / p99 | 156.18 / 249.03 / 287.33 ms | 100% within 500 ms on this loopback-forwarded path |
| Registration max (40 samples) | 272.71 ms | **PASS** — under 2,000 ms |
| Login max (40 samples) | 90.06 ms | **PASS** — under 2,000 ms |
| Latest-50 history p95 (10 samples) | 45.69 ms | **PASS** — under 1,000 ms |
| Benchmark checks | All true | **PASS** |

**PERF-2: PASS** for this run: the 100-client 10-minute workload completed without message loss, and server/database resource use was recorded while both processes ran inside the verified WSL2 2 GB memory limit. The benchmark generator's own JSON host-memory metrics describe the Windows load-generator host, not the WSL server; server/database measurements are in the separate WSL logs.

The 249.03 ms p95 and 100% within 500 ms were measured over Windows-to-WSL localhost forwarding. They do **not** satisfy PERF-1's separate LAN and broadband path requirement. Browser visible-readiness was not measured; PERF-5 remains **NOT RUN**.

WSL checkout verification: `npm ci` completed, the full Jest suite passed (**27 suites, 191 tests**), `npm run lint` passed, and `node --check` passed for `scripts/performance-test.js`, `scripts/performanceResources.js`, and `src/server.js`.

Artifacts: `docs/ca45-perf2-wsl-2026-11-17.json`, `docs/ca45-perf2-wsl-2026-11-17-process-top.txt`, and `docs/ca45-perf2-wsl-2026-11-17-vmstat.txt`. WSL test data remains in the new `~/ca45-perf-wsl/mongo-data` directory; no database cleanup was performed.
