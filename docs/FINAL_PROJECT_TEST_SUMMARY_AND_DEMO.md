# Final Project Test Summary and Demo Guide

**Project:** Real-Time Chat Application (Socket Programming) — Team 5  
**Course:** Software Engineering mini-project  
**Evidence snapshot:** 30 October 2026  
**Repository:** https://github.com/chat-application-team5-org/chat-application-team5-import

> This document consolidates the verification evidence currently recorded in the repository and the CA-45 measurements supplied during project work. It does not replace the SRS, SAD, or Test Plan. Do not describe an item as passed unless its evidence is recorded below.

## 1. Project overview

The project is a browser-based real-time chat application built with Node.js, Express, WebSockets (ws), and MongoDB/Mongoose. The browser communicates with the server through HTTP APIs and an authenticated WebSocket endpoint.

The repository README describes the following implemented areas: registration and login, authenticated WebSocket messaging, private conversations, message persistence and history, user search, offline message replay, and the browser chat interface. Refer to the source and corresponding test cases when demonstrating any feature.

## 2. How to run the application for a demo

### Prerequisites

- Node.js 20 or later.
- MongoDB running locally or an approved MongoDB Atlas database.
- A disposable demo database and a test-only JWT secret.

### Windows PowerShell setup

From the repository folder:

~~~powershell
npm ci
$env:MONGO_URI = "mongodb://127.0.0.1:27017/chatapp_demo_local"
$env:JWT_SECRET = "replace-with-a-long-random-demo-only-secret"
$env:ALLOWED_ORIGIN = "http://localhost:3000"
npm start
~~~

Do not use production credentials or a shared/production database for the demo. Do not display or commit secrets.

Open:

- Application: http://localhost:3000
- Health endpoint: http://localhost:3000/health

Before recording, verify that the health endpoint reports the application is healthy and MongoDB is connected.

## 3. Automated test evidence recorded

| Verification | Recorded result | Notes |
|---|---|---|
| Dependency installation | npm ci completed | Local install output also reported 9 dependency vulnerabilities (5 low, 1 moderate, 2 high, 1 critical); advisories still need triage |
| Unit tests | 11 suites; 81 tests passed | Recorded run on 30 October 2026 |
| MongoDB integration test | 1 suite; 1 test passed | Used a separate disposable test database |
| Lint | Passed | Recorded run on 30 October 2026 |
| git diff --check | Passed | Recorded run on 30 October 2026 |
| Pull-request CI | Passed on PR #58 | PR #58 is a documentation update and was still awaiting review/merge at this evidence snapshot |

The package scripts include npm test, npm run test:integration, npm run lint, and npm run test:coverage. The 70% coverage target has **not been confirmed by a recorded coverage report in this evidence set**. Run npm run test:coverage and record the statement/branch/function coverage before claiming that target is met.

## 4. CA-45 performance results

### Full automated run

| Metric | Result |
|---|---:|
| Duration | 600 seconds (10 minutes) |
| Simultaneous WebSocket clients | 100 |
| Expected recipient deliveries | 60,000 |
| Confirmed recipient deliveries | 60,000 |
| Missing recipient deliveries | 0 |
| Missing acknowledgements | 0 |
| Unexpected disconnects | 0 |
| Skipped sends | 0 |
| Message latency p50 | 104.72 ms |
| Message latency p95 | 161.19 ms |
| Message latency p99 | 237.22 ms |
| Messages within 500 ms | 99.99% |
| Registration maximum | 189.30 ms |
| Login maximum | 85.28 ms |
| Latest 50-message history p95 | 72.77 ms |

The 10-minute run used a host reporting **15.61 GiB RAM** and loopback networking. The 100-client result does not prove the SRS requirement on a 2 GB machine. The loopback latency does not prove latency over a separate LAN or broadband path.

### PERF-5 — Chrome page-load check

Chrome DevTools Network was configured with:

- Custom profile: 4 Mbps download and 4 Mbps upload.
- Added latency: 0 ms.
- Disable cache: enabled.
- Page: initial chat application login page.
- Metric captured: Network panel **Finish** time.

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

All five Network Finish readings were below the 3,000 ms target. This is a recorded page-load timing proxy under the configured Chrome throttle; it is not a separate automated user-interaction or field-user measurement.

See PERFORMANCE_TEST_RESULTS.md for the detailed results and remaining conditions.

## 5. Remaining verification and risks

| Area | Evidence status | Action before claiming full completion |
|---|---|---|
| PERF-1 — message delivery latency | Loopback results recorded; separate network path not measured | Run/record the latency check over a separate LAN or broadband path |
| PERF-2 — 100 concurrent clients | Passed on 15.61 GiB host only | Repeat with the server limited to or running on the SRS-specified 2 GB environment, and record actual environment details |
| PERF-3 — registration/login | Numerical targets passed in recorded run | Retain the measured maximum values |
| PERF-4 — latest 50 messages | Numerical target passed in recorded run | Retain the measured p95 |
| PERF-5 — initial page at 4 Mbps | Five Chrome Network Finish readings recorded below 3 seconds | Keep the measurement definition and Chrome throttle configuration alongside the results |
| Coverage target (CA-48) | No coverage percentage recorded in this evidence set | Run npm run test:coverage and compare against the 70% target |
| Security checks (CA-46 / CA-43) | Not consolidated in this report | Verify security checklist results and triage the reported npm audit findings |
| Reliability / backup and restore (CA-47) | Not consolidated in this report | Record backup, restore, restart and usability checks |
| Final submission materials (CA-49) | This guide and the performance report are present | Confirm the required SRS, SAD, Test Plan, RTM, screenshots and demo video are in the expected locations |

The GitHub backlog contains imported team issues for CA-46 to CA-49 and other feature tasks. Imported issue state may be stale where work was completed by merged PRs. Check the actual Jira/sprint board and PR evidence with the relevant team members; do not assume every open imported issue is unimplemented or assigned to one person.

## 6. Suggested live demo sequence

Target: approximately 3–4 minutes. Use demo-only accounts and a disposable database.

1. **Start-up and health (15–20 seconds).** Show the server running and /health reporting healthy status with MongoDB connected.
2. **Two-user sign-in (20–30 seconds).** Open two separate browser profiles. Register or sign in as demo-only users Alice and Bob. Show their connected state if available.
3. **Find a user and open a conversation (20–30 seconds).** In Alice's view, use user search to find Bob and open the private conversation.
4. **Real-time message flow (30–40 seconds).** Send a short message from Alice and show it arrive in Bob's view. Point out the sender, time and status shown by the UI.
5. **Persistence and history (20–30 seconds).** Refresh Bob's view, reopen the conversation and show the message remains in history. Scroll upward to demonstrate older history only if there are more than 50 messages available.
6. **Offline delivery (30–40 seconds, if successfully rehearsed).** Disconnect Bob, send a message from Alice, reconnect Bob and show the pending message replay. Do not claim success if the live demo fails.
7. **Verification evidence (20–30 seconds).** Show the successful CI status, the test summary, and the performance results. Clearly mention that the 2 GB and separate network-path checks remain pending unless new evidence has been added.

### One-minute fallback demo

If time is limited, follow the existing SPRINT1_DEMO.md guide: health endpoint, two demo users, search/open conversation, send/receive, message history after refresh, and a CI check.

## 7. Submission checklist

- [ ] Confirm the required SRS, SAD and Test Plan files are present in the repository.
- [ ] Confirm the Requirements Traceability Matrix is current and linked to actual test cases.
- [ ] Run and record npm run test:coverage; report the actual percentage.
- [ ] Review and document npm audit findings; do not blindly run npm audit fix --force.
- [ ] Ensure the final test summary and performance report are committed after review.
- [ ] Rehearse the demo using only demo accounts and a disposable database.
- [ ] Confirm the demo video opens and plays; the README links to docs/Team5_Sprint1_Chat_Demo.mp4.mp4.
- [ ] Check Jira/sprint statuses with the team; close only tasks whose acceptance criteria and evidence are complete.
- [ ] Submit the repository link and required files using the faculty's official submission method.

## 8. Team and contribution note

The repository's historical sprint snapshot lists four project members and area ownership. Use the current Jira/GitHub contribution history when preparing the final contribution statement; do not infer an individual's completed work solely from the historical snapshot.

---

**Final status:** The project has a runnable application, recorded automated test results, a 10-minute performance run, and five PERF-5 Chrome measurements. The evidence currently available does **not** establish every project-wide acceptance target: the 2 GB load test, separate LAN/broadband latency test, 70% coverage result, and consolidated security/reliability evidence still need verification or explicit team sign-off.
