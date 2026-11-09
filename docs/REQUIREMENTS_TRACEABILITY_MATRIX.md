# Requirements Traceability Matrix (RTM)

**Project:** Real-Time Chat Application (Socket Programming) - Team 5  
**Repository:** `chat-application-team5-org/chat-application-team5-import`  
**Baseline inspected:** `main` at `4d55fdc838b7c4484de4476ec1a3f043fca2ed44`  
**RTM preparation date:** 5 November 2026

**Sprint 3 update:** This matrix is a historical baseline, not the current security status. The source PDFs were subsequently inspected; see `docs/CA-46_SECURITY_VALIDATION.md` and `docs/CA-43_DEPLOYMENT_SECURITY.md` for updated security evidence and remaining verification.

## 1. Scope and evidence rules

This matrix links requirement identifiers visible in the repository's historical sprint backlog and JIRA backlog export to the implementation and executable tests present on the inspected `main` branch. Requirement descriptions below are concise backlog paraphrases, not quotations from the SRS.

The repository contains the source PDFs `docs/SRS-Document-Team5 (1).pdf`, `docs/SAD_Chat_Application_Team5.pdf`, and `docs/Test_Plan_Chat_Application_Team5.pdf`. Their files are present, but their full text and detailed functional test-case tables were not available to this GitHub inspection. Therefore:

- Do not treat this as a verbatim SRS transcription or a signed-off academic RTM until the requirement wording and detailed Test Plan IDs are checked against those PDFs.
- Test Plan IDs are included only where a repository text document explicitly names them (`TC-PERF-01` to `TC-PERF-03`, and the security section reference `STP 5.1`). No functional Test Plan IDs have been invented.
- Jest test titles and file paths are used as executable test evidence where formal Test Plan case IDs could not be verified.
- Status reflects inspected implementation and evidence, not the 7 October 2026 backlog status columns.

### Status definitions

- **Tested** - matching implementation and an executable test or recorded verification are present.
- **Partially tested** - some relevant implementation/evidence exists, but a meaningful portion of the stated requirement or its end-to-end/UI/network acceptance is not verified.
- **Not verified** - no sufficient implementation/test evidence was found in the inspected `main` branch. This does not claim the feature can never exist outside the inspected repository.

## 2. Functional requirements

| Requirement | Backlog-derived requirement summary | Implementation / design evidence | Test evidence | Status |
|---|---|---|---|---|
| REQ-1 | Register a user account using the required account fields. | `src/modules/auth/routes.js`; `src/modules/auth/authService.js` (`registerUser`). | `tests/auth.test.js`: `registration validates fields and stores a salted bcrypt hash`; `registration rejects an existing account`. | Tested |
| REQ-2 | Validate registration fields and reject invalid or duplicate account details. | `src/modules/auth/authService.js` (`validateRegistration`); unique account checks in `registerUser`. | `tests/auth.test.js`: registration validation and duplicate-account tests. | Tested |
| REQ-3 | Store passwords as salted bcrypt hashes. | `src/modules/auth/authService.js` (`bcrypt.hash`, cost 10); `src/models/User.js`. | `tests/auth.test.js`: `registration validates fields and stores a salted bcrypt hash`. | Tested |
| REQ-4 | Allow login by username or email and issue a time-limited JWT (backlog says 24 hours). | `src/modules/auth/authService.js` (`loginUser`); `src/config.js` defaults `JWT_EXPIRES_IN` to `24h`. | `tests/auth.test.js` contains failed-login/lockout coverage; `tests/gatewayJwtAuth.test.js` covers valid JWT acceptance. No explicit test title in the inspected suite verifies username-versus-email success and the exact 24-hour expiry together. | Partially tested |
| REQ-5 | Return a generic login failure and lock an account after five failed attempts for 15 minutes. | `src/modules/auth/authService.js` (`MAX_LOGIN_ATTEMPTS`, `LOCK_DURATION_MS`, generic invalid-credentials response). | `tests/auth.test.js`: `failed login uses a generic error and locks after five consecutive failures`; `expired lockout resets previous failed attempts`. | Tested |
| REQ-6 | Require authenticated WebSocket connections and enforce the configured Origin. | `src/ws/gateway.js` (`verifyClient`, JWT authentication, auth deadline); `src/config.js`. | `tests/gateway.test.js`: configured/missing Origin and authentication cases; `tests/gatewayJwtAuth.test.js`: valid, invalid, expired, and missing JWT cases. | Tested |
| REQ-7 | Logout requires a valid identity, clears the browser session token, and closes its WebSocket. | `src/modules/auth/routes.js` (`POST /logout`); `public/js/app.js`; `public/js/ws.js` (`close`). | `tests/auth.test.js`: `logout requires a signed token`. The inspected automated test does not verify the complete browser token-clear plus socket-close behavior. | Partially tested |
| REQ-8 | Open or create a private conversation with another user. | `src/modules/messaging/conversationService.js`; `src/modules/messaging/routes.js`. | `tests/conversationService.test.js`; `tests/conversationRoute.test.js`; `tests/conversationApi.test.js`. | Tested |
| REQ-9 | Deliver messages in real time over WebSockets. | `src/ws/gateway.js` (`message:send`, recipient delivery); `src/modules/messaging/messageService.js`. | `tests/gateway.test.js`: `delivers a saved message to the online recipient and acks the sender`; `tests/messageService.test.js`: message persistence and recipient handling. | Tested |
| REQ-10 | Accept non-blank messages of 1-2,000 characters and reject invalid lengths. | `src/modules/messaging/validation.js`; `src/models/Message.js`. | `tests/validation.test.js`: normal, 2,000-character, and 2,001-character cases; `tests/models.test.js`: blank/overlength content cases. | Tested |
| REQ-11 | Persist messages for offline recipients and deliver pending messages when they reconnect. | `src/modules/messaging/messageService.js` (`loadPendingMessagesForRecipient`); `src/ws/gateway.js` pending replay. | `tests/gateway.test.js`: `replays pending messages after authentication`; `tests/messageService.test.js`: pending-message selection; `tests/integration/messaging.integration.test.js`: `offline messages replay after reconnect, are acknowledged once, and survive restart`. | Tested |
| REQ-12 | Display the sender, timestamp, delivery status, and message ownership in the message pane. | `public/js/messages.js`; `public/index.html`. | `docs/SPRINT1_DEMO.md` records a manual two-user verification and a visible sender/time/`SENT` status. No automated browser/UI test was found. | Partially tested |
| REQ-13 | Render message content safely to prevent XSS. | `public/js/messages.js` and `public/js/ui.js` use `textContent` rather than inserting message/server text as HTML. | Code inspection only; no dedicated automated XSS payload test was found in the inspected test suite. | Partially tested |
| REQ-14 | Create a named group with members; creator becomes group administrator. | `src/modules/group/groupService.js`; `src/modules/group/routes.js`; `src/models/Conversation.js`. | `tests/groupService.test.js`: group creation, creator ADMIN, validation and member checks; `tests/groupRoutes.test.js`: authenticated creation and ADDED event. | Tested |
| REQ-15 | Broadcast a group message to online group members. | `src/ws/gateway.js` group-message flow. | `tests/gateway.test.js`: `broadcasts a group message to every online recipient with the sender username`. | Tested |
| REQ-16 | Allow group administration: add/remove members, rename group, and allow a member to leave. | Current inspected `src/modules/group/routes.js` exposes group creation only; no add/remove/rename/leave routes or service operations were found. | No matching executable test was found. | Not verified |
| REQ-17 | Include the sender's identity/name in group message delivery. | `src/ws/gateway.js` group-message broadcast payload. | `tests/gateway.test.js`: group broadcast test explicitly checks delivery with sender username. | Tested |
| REQ-18 | Authorize conversation reads and writes against conversation membership. | `src/modules/messaging/messageService.js`; `src/modules/messaging/routes.js`; `src/ws/gateway.js` typing/group paths. | `tests/messageService.test.js`: non-member send/ack rejection; `tests/messagingRoutes.test.js`: history access denied to a non-member; `tests/gateway.test.js`: non-member typing rejection. | Tested |
| REQ-19 | Track online/offline presence and last-seen information. | `src/modules/presence/presenceService.js`; `src/ws/gateway.js`; `src/modules/users/routes.js`; `public/js/app.js`. | `tests/presenceService.test.js`; `tests/gateway.test.js`: online/offline transitions and remaining online while another connection exists. | Tested |
| REQ-20 | Provide a typing indicator to other conversation members. | `src/ws/gateway.js` (`typing:start` / `typing:update`); `public/js/app.js`. | `tests/gateway.test.js`: typing updates go only to other members; rejects non-member and invalid-conversation typing events. Browser rendering has no automated UI test. | Partially tested |
| REQ-21 | Use WebSocket ping/pong heartbeat and mark a broken connection offline within 40 seconds. | `src/ws/gateway.js` sets a 30-second ping interval and a 10-second pong timeout. | `tests/gateway.test.js`: periodic ping, responsive pong, and termination of clients that do not respond. | Tested |
| REQ-22 | Automatically reconnect with exponential back-off and resynchronise messages. | `public/js/ws.js` contains exponential-backoff reconnect; `public/js/app.js` requests newer history after reconnect and acknowledges recovered messages; server replays pending messages. | `tests/integration/messaging.integration.test.js` verifies server-side replay after reconnect. No automated browser test verifies client back-off timing and UI resynchronisation end to end. | Partially tested |
| REQ-23 | Persist every message before acknowledging it to the sender/recipient. | `src/modules/messaging/messageService.js`; `src/ws/gateway.js`. | `tests/gateway.test.js`: `does not ack until the save has finished`; `sends an error and no ack or delivery when the save fails`; integration test checks persistence across restart. | Tested |
| REQ-24 | Load the latest 50 messages and page older history when the user scrolls upward. | `src/modules/messaging/routes.js` (default limit 50, `before`/`after` cursors); `public/js/app.js` (scroll paging and resynchronisation). | `tests/messagingRoutes.test.js`: latest-page, older-page, newer-page, cursor validation, and page-limit cases. No automated browser scroll test was found. | Partially tested |
| REQ-25 / REQ-26 | Show real-time sent, delivered, and read status ticks. | `src/ws/gateway.js` sends `SENT` and `DELIVERED` status events; `public/js/messages.js` renders SENDING/SENT/DELIVERED/READ labels. No server-side read-receipt event/route was found. | `tests/gateway.test.js`: send and delivery acknowledgement status flow; no read-receipt test was found. | Partially tested |
| REQ-27 / REQ-28 | Provide unread counters and in-app notifications. | `src/modules/messaging/routes.js` aggregates unread incoming messages by conversation using `readBy`; `src/modules/messaging/messageService.js` marks all incoming messages in an opened conversation read; `public/js/app.js` renders/refetches counters, shows in-app toast notifications for other conversations, and updates the title through `public/js/unread.js`. Browser notification permission is not requested. | `tests/messagingRoutes.test.js`: unread counts for private/group conversations and sender/read-state filters; `tests/messageService.test.js`: mark all incoming messages read in only the target conversation; `tests/unreadNotificationsClient.test.js`: notification routing/deduplication and title reset. No full browser automation test. | Partially tested |
| REQ-29 | View/edit the user's display name and status message. | `src/modules/profile/` contains only a placeholder; no profile API route was found. Search results currently use username as display name. | No matching automated test was found. | Not verified |
| REQ-30 | Change password after verifying the current password. | No change-password endpoint/service was found in the inspected authentication/profile modules. | No matching automated test was found. | Not verified |
| REQ-31 | Search users by partial username and start a private chat. | `src/modules/users/routes.js`; `public/js/app.js`; `src/modules/messaging/conversationService.js`. | `tests/userSearchApi.test.js`: authenticated partial, case-insensitive search, regex escaping, empty/long query; conversation creation tests verify the private-chat API path. No automated browser test verifies the full search-click-chat UI flow. | Partially tested |

## 3. Performance requirements

The repository text describes PERF-1 to PERF-5 and explicitly says the performance procedure maps to Test Plan cases `TC-PERF-01` to `TC-PERF-03`. The exact case-to-requirement split in the PDF Test Plan was not available; do not assign those three IDs individually without checking the PDF.

| Requirement | Acceptance summary | Implementation / evidence | Recorded result and limitation | Status |
|---|---|---|---|---|
| PERF-1 | At least 95% of messages <=500 ms on a local network; use 1,000 ms for typical broadband. | `scripts/performance-test.js`; `docs/PERFORMANCE_TESTING.md`; `docs/PERFORMANCE_TEST_RESULTS.md`. | Recorded p95 161.19 ms and 99.99% within 500 ms, but the run used loopback. Separate LAN/broadband path was not tested. | Partially tested |
| PERF-2 | 100 simultaneous WebSocket clients without message loss, on the SRS-specified 2 GB environment. | `scripts/performance-test.js`; CI `perf:smoke`; `docs/PERFORMANCE_TEST_RESULTS.md`. | 600-second run recorded 100 clients and 60,000/60,000 deliveries with zero missing acknowledgements, but host had 15.61 GiB RAM. Repeat on a 2 GB environment. | Partially tested |
| PERF-3 | Registration and login each within 2 seconds. | `scripts/performance-test.js`; `docs/PERFORMANCE_TEST_RESULTS.md`. | Recorded registration maximum 189.30 ms and login maximum 85.28 ms in the 10-minute test. | Tested (recorded run) |
| PERF-4 | Latest 50-message history returned within 1 second. | `src/modules/messaging/routes.js`; `scripts/performance-test.js`; `docs/PERFORMANCE_TEST_RESULTS.md`. | Recorded latest-50 history p95 72.77 ms in the 10-minute test. | Tested (recorded run) |
| PERF-5 | Initial page usable within 3 seconds on a 4 Mbps connection. | Manual Chrome DevTools procedure/result in `docs/PERFORMANCE_TESTING.md` and `docs/PERFORMANCE_TEST_RESULTS.md`. | Five Network Finish timings: 212, 191, 185, 206, 182 ms; maximum 212 ms. This is Network Finish, not a direct interaction-ready/visual-usability measure. | Partially tested |

## 4. Safety and security requirements

The backlog gives only partial summaries for these IDs. The full text for the referenced requirements is in the SRS PDF and must be cross-checked before formal sign-off.

| Requirement | Backlog-derived summary | Implementation / test evidence | Status |
|---|---|---|---|
| SAF-1 | Persist messages before acknowledgements. | Same evidence as REQ-23: `src/modules/messaging/messageService.js`, `src/ws/gateway.js`, `tests/gateway.test.js`, and the integration test. | Tested |
| SAF-2 | Rate limiting and WebSocket frame-size limit. | `src/ws/gateway.js` sets `maxPayload` to 4,096 bytes. `src/app.js` limits JSON bodies to 10 KB. No rate-limiting middleware or rate-limit test was found in the inspected source tree. | Partially tested |
| SAF-3 | Central error handling, safe logging, and health endpoint. | `src/middleware/errorHandler.js`; `src/app.js`; `src/db/connect.js`; `tests/health.test.js`; `tests/dbConnect.test.js`. | Partially tested - health/error/database branches are covered, but safe logging is not independently security-tested. |
| SAF-4 | Reliability/backup/restore and usability verification (backlog summary). | `docs/FINAL_PROJECT_TEST_SUMMARY_AND_DEMO.md` identifies backup/restore/usability evidence as not consolidated; no backup/restore test evidence was found in inspected repository docs/tests. | Not verified |
| SEC-2 | Referenced by the backlog under central error handling/safe logging. | Exact SEC-2 statement was not available from the parsed source; error handling code and health tests exist. | Not verified against exact SRS wording |
| SEC-3 | TLS (`https`/`wss`) and secrets handling (backlog summary also references SEC-8). | `.env.example` and README explain secret configuration; no HTTPS/WSS deployment configuration was found in the inspected source. | Partially tested - secret handling instructions exist; TLS deployment not evidenced. |
| SEC-4 | XSS protection. | `public/js/messages.js` and `public/js/ui.js` use `textContent`; no dedicated XSS test found. | Partially tested |
| SEC-5 | Conversation membership authorisation. | Messaging send/history and WebSocket typing membership checks; see REQ-18 tests. | Tested for inspected paths |
| SEC-8 | Dependency audit (backlog summary). | `docs/FINAL_PROJECT_TEST_SUMMARY_AND_DEMO.md` records 9 npm audit vulnerabilities (5 low, 1 moderate, 2 high, 1 critical) from the install evidence. No completed triage/remediation report was found. | Not verified / findings need triage |
| SEC-1, SEC-6, SEC-7 | Referenced by backlog's CA-46 security validation task (STP 5.1, SEC-1 to SEC-8); individual descriptions are not stated in the accessible backlog text. | No reliable requirement description or requirement-specific test mapping could be extracted without the SRS and Test Plan text. | Not verified - source wording needed |

## 5. Test execution and CI evidence

### Current main CI

The latest observed GitHub Actions run for the inspected `main` commit `4d55fdc838b7c4484de4476ec1a3f043fca2ed44` completed successfully on **4 November 2026**:

- `npm ci` - passed
- `npm test -- --runInBand` - passed
- `npm run test:integration` - passed
- `npm run lint` - passed
- server startup and health check for performance smoke - passed
- `npm run perf:smoke` (100-client smoke) - passed

Workflow run: https://github.com/chat-application-team5-org/chat-application-team5-import/actions/runs/41868570214

### Last recorded CA-48 coverage run

`docs/TEST_COVERAGE_RESULTS.md` records a run dated **30 October 2026** and added by PR #60 (merged 31 October 2026):

| Metric | Recorded result |
|---|---:|
| Unit suites | 14 passed |
| Unit tests | 107 passed |
| Statements | 90.53% |
| Branches | 79.60% |
| Functions | 88.40% |
| Lines | 92.09% |
| Integration | 1 suite, 1 test passed |
| Lint | Passed |
| `git diff --check` | Passed |

PR #60: https://github.com/chat-application-team5-org/chat-application-team5-import/pull/60

These are recorded results from 30 October, not a fresh coverage run on the 4 November `main` commit. The repository's Jest coverage configuration collects `src/**/*.js`, so browser JavaScript/CSS is excluded. `src/server.js` is recorded at 0% because it starts the listening process and is not imported by the unit tests. `package.json` does not define a `coverageThreshold`, so the 70% target is measured, not enforced by CI.

## 6. Gaps to close before claiming full RTM completion

1. Read the SRS PDF and replace each backlog paraphrase with the exact approved requirement wording.
2. Read the Test Plan PDF and add the exact functional and non-functional Test Case IDs beside the executable Jest/browser/manual evidence. Only `TC-PERF-01` to `TC-PERF-03` and `STP 5.1` are currently identifiable in repository text.
3. Add or record tests for the incomplete requirements: successful username/email login and JWT expiry; logout client token/socket cleanup; browser UI behavior; reconnect/back-off/resync; read receipts; unread notifications; profile updates; password changes; group administration; rate limiting; backup/restore; and missing security checks.
4. Repeat PERF-1 on a separate LAN/broadband path and PERF-2 in a 2 GB environment. Preserve actual machine/network details.
5. Rerun coverage on the exact submission commit if the final branch changes after the 30 October recorded coverage run.

## 7. Repository source references

- [SRS PDF](SRS-Document-Team5%20(1).pdf)
- [SAD PDF](SAD_Chat_Application_Team5.pdf)
- [Test Plan PDF](Test_Plan_Chat_Application_Team5.pdf)
- [Historical sprint backlog snapshot](SPRINT_BACKLOG_SNAPSHOT.md) - explicitly dated 7 October 2026; requirement mapping context only, not current task status.
- [JIRA backlog export](JIRA_BACKLOG.csv)
- [CA-48 test coverage results](TEST_COVERAGE_RESULTS.md)
- [CA-45 performance testing procedure](PERFORMANCE_TESTING.md)
- [CA-45 performance test results](PERFORMANCE_TEST_RESULTS.md)
- [Final project test summary and demo guide](FINAL_PROJECT_TEST_SUMMARY_AND_DEMO.md)
