# CA-48 Sprint 2 traceability and verification update

**Evidence date:** 2026-11-07. **Base:** `main` at `418a168c2190dc08116403ff15bb5d2f43a38fb0`, with local CA-26, CA-31, CA-44 and CA-48 changes applied. This is an update to the Test Plan's Section 13 RTM, not a claim of complete execution or formal sign-off. The team RTM from PR #67 has been merged as `docs/REQUIREMENTS_TRACEABILITY_MATRIX.md`; reconcile this update with it during review, rather than replacing it.

## Test Plan case mapping

The following mappings are transcribed from Section 13 of `Test_Plan_Chat_Application_Team5.pdf` (pages 5–7). A mapping means a test is *planned*, not that it passed. Multiple requirements on one line map to the case(s) shown for each group.

| Requirements | Planned Test Plan case IDs |
|---|---|
| REQ-1, REQ-3 | TC-AUTH-01 |
| REQ-2 | TC-AUTH-02 |
| REQ-4 | TC-AUTH-03 |
| REQ-5 | TC-AUTH-04 |
| REQ-6 | TC-AUTH-05 |
| REQ-7 | TC-AUTH-06 |
| REQ-8, REQ-31 | TC-MSG-01 |
| REQ-9, REQ-12 | TC-MSG-02 |
| REQ-10 | TC-MSG-03 |
| REQ-11 | TC-MSG-04 |
| REQ-13 | TC-MSG-05 |
| REQ-14 | TC-GRP-01 |
| REQ-15, REQ-17 | TC-GRP-02 |
| REQ-16 | TC-GRP-03 |
| REQ-18 | TC-GRP-04 |
| REQ-19, REQ-20, REQ-21, REQ-22 | TC-PRS-01, TC-PRS-02, TC-PRS-03, TC-PRS-04, respectively |
| REQ-23, REQ-24 | TC-HIS-01, TC-HIS-02, respectively |
| REQ-25, REQ-26 | TC-STS-01 |
| REQ-27, REQ-28 | TC-STS-02 |
| REQ-29, REQ-30 | TC-PRF-01, TC-PRF-02, respectively |
| PERF-1, PERF-2, PERF-3, PERF-4, PERF-5 | TC-PERF-01, TC-PERF-02, TC-PERF-02, TC-HIS-02, TC-PERF-03, respectively |
| SAF-1, SAF-2, SAF-3, SAF-4 | TC-HIS-01; TC-SEC-04; TC-PRS-04 and TC-SAF-01; TC-SAF-02, respectively |
| SEC-1, SEC-2, SEC-3 | TC-AUTH-03 and TC-AUTH-05; TC-SEC-01; TC-SEC-02, respectively |
| SEC-4, SEC-5, SEC-6, SEC-7, SEC-8 | TC-MSG-05, TC-GRP-04, TC-SEC-03, TC-AUTH-04, TC-SEC-05, respectively |
| BR-1, BR-2, BR-3, BR-4, BR-5, BR-6 | TC-AUTH-05, TC-AUTH-02, TC-GRP-04, TC-GRP-03, TC-MSG-03, TC-AUTH-04, respectively |
| USABILITY, RELIABILITY | TC-USB-01, TC-REL-01, respectively |

## Sprint 2 evidence and remaining gaps

| Requirement / case | Evidence from this branch | Status and limitations |
|---|---|---|
| REQ-13 / SEC-4; TC-MSG-05 | `tests/validation.test.js`, `tests/messageService.test.js`, `tests/messageXssClient.test.js`, `tests/auth.test.js`, and the CA-26/CA-31 MongoDB integration scenario. New stored messages are escaped; the browser decodes one marked layer and uses `textContent`. | **Partially verified:** script and image payloads are covered in unit tests, operator password is rejected, and the script payload is checked through a real database, WebSocket and history. The client test uses a simulated DOM, not a real browser execution test. Legacy records are not migrated and must be rendered as text. SEC-4 covers more than messages and is not fully verified here. |
| REQ-18 / SEC-5 / BR-3; TC-GRP-04 | `tests/authorization.test.js`, `tests/messagingRoutes.test.js`, `tests/messageService.test.js`, `tests/gateway.test.js`, and the CA-26/CA-31 integration scenario cover outsider reads and sends on private/group conversations, filtered listing, and subsequent requests from a directly removed group member. | **Partially verified:** actual removal was simulated with a database update; CA-32 group membership management and concurrent revocation races are not tested. SEC-5 covers every request/event, beyond these tested paths. |
| SAF-3 / SEC-2; TC-PRS-04, TC-SAF-01, TC-SEC-01 | CA-44 PR #68 is included with a local heartbeat syntax repair and security tests for safe errors and logs. | **Partially verified:** local unit, integration and lint checks pass. Review the combined changes and verify security/reliability scenarios before sign-off; PR #68 remains open separately. |
| Other requirements | See the full Test Plan and the merged team RTM. | **Not assessed in this update.** Planned IDs do not establish passing execution results. |

## Local verification

- `npm run test:coverage`: 19 suites, 155 tests passed; aggregate server coverage: statements 91.73%, branches 77.37%, functions 92.66%, lines 92.60%. Jest now enforces 70% in each aggregate category; CI runs the coverage command. Browser code and the separately run integration suite are excluded from those figures; `src/server.js` remains untested.
- `npm run test:integration`: 1 suite, 2 tests passed using an isolated local MongoDB 7.0.16 database named `chatapp_test_sprint2` and a test-only secret. The test drops that disposable database. This run includes persistence/restart/replay and the new security scenario.
- `npm run lint`: passed. These are local results, not a claim that GitHub CI or a teammate review has passed.
