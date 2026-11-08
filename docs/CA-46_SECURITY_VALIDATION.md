# CA-46: Sprint 3 security validation

Scope: Software Test Plan section 5.1 and the SRS security requirements SEC-1 to SEC-8. Results below are local development evidence, not a production security sign-off. The repository's PDFs are the source of the requirement and test case identifiers. Re-run the checks after integrating other Sprint 3 work.

## Execution evidence

- `npm run test:coverage`: 22 suites / 168 tests passed; 92.27% statements, 78.97% branches, 93.16% functions and 93.16% lines. Node 24 on Linux. Expected negative tests emit error logs.
- `npm run test:integration`: 3 tests passed against an isolated MongoDB 7.0.16 instance and a disposable `chatapp_test_sprint3` database. Tests cover offline recovery, message/membership checks, and 20 accepted sends followed by a rate-limited 21st send across two sockets.
- `npm run lint`: passed.
- `npm run perf:smoke`: passed locally with 100 clients, 300/300 expected load-message deliveries, no missing acknowledgements and p95 371.44 ms (loopback, 15-second load phase). This is a smoke check, not the full deployment performance acceptance.
- Local TLS exercise with a temporary self-signed certificate and disposable MongoDB: HTTPS health check and authenticated WSS succeeded, TLS 1.2 succeeded and TLS 1.1 was rejected. This does not establish trust or security of a hosted deployment. See `docs/CA-43_DEPLOYMENT_SECURITY.md`.
- `npm audit`: 0 high, 0 critical, 20 moderate, 3 low; `npm audit --omit=dev`: 0 findings. The 23 findings are in development dependencies. Re-run and triage; advisories change over time.

## Test Plan section 5.1

| Requirement / case | Evidence executed | Status and remaining checks |
|---|---|---|
| SEC-1 / TC-AUTH-03, TC-AUTH-05 | `tests/securityAuth.test.js`, `tests/gatewayJwtAuth.test.js`, `tests/gateway.test.js` exercise invalid, unsigned, tampered and expired JWTs and unauthenticated WebSockets. | Partial: complete username/email login and full end-to-end authentication scenarios on the integrated deployment remain to be verified. |
| SEC-2 / TC-SEC-01 | `tests/auth.test.js` checks salted bcrypt hashing; `tests/securityAuth.test.js` checks the structured logger excludes unapproved password, token and message fields. | Partial: inspect live registration, login, failed login and messaging logs and error responses for passwords, hashes, tokens and message text; confirm bcrypt cost >=10 in the real database. Do not record actual secrets in evidence. |
| SEC-3 / TC-SEC-02 | TLS configuration tests and the local HTTPS/WSS exercise above. | Hosted case not run: test a real CA-trusted certificate, TLS 1.2/1.3, rejected TLS 1.1, and rejection of public plaintext HTTP/WS on the actual authorized deployment. |
| SEC-4 / TC-MSG-05 | `tests/validation.test.js`, `tests/messageXssClient.test.js`, `tests/auth.test.js`, and the real-database messaging integration test exercise escaping, literal rendering and a NoSQL operator in a password. | Partial: full browser payload set, malformed JSON/event fuzzing and OWASP ZAP baseline scan were not executed; other input surfaces must be reviewed. |
| SEC-5 / TC-GRP-03, TC-GRP-04 | `tests/authorization.test.js`, messaging route/gateway tests and real-database integration cover selected outsider/removed-member read/write paths. | Partial: verify every relevant request/event, including non-admin group actions and newly implemented CA-32 behavior, once integrated. |
| SEC-6 / TC-SEC-03 | `tests/gateway.test.js` checks allowed, foreign and missing Origin handshakes. | Local handshake checks passed; verify the exact hosted origin, with valid credentials and no delivered presence/message events, before sign-off. |
| SEC-7 / TC-AUTH-04 | `tests/auth.test.js` covers five failures, generic error and expired-lockout behavior; JWT tests cover expiration. The configured default token lifetime is 24 hours. | Partial: verify exact 15-minute lockout and 24-hour token expiry end-to-end on the integrated system. |
| SAF-2 / TC-SEC-04 | `tests/rateLimiter.test.js`, gateway tests and real-database integration check the 20-per-10-second per-user limit, cross-socket/reconnect enforcement, and an oversized 4,097-byte frame. Gateway remains responsive after rejection. | Local automated checks passed. Limit is process-local, resets on restart, and requires a shared store for multi-instance deployment. The 4 KB limit applies to the entire WebSocket frame payload, including JSON. |
| SEC-8 / TC-SEC-05 | Dependency audit results above and secret configuration guidance in `docs/CA-43_DEPLOYMENT_SECURITY.md`. | Partial: a complete OWASP Top 10/privacy and outbound-network review, repository history secret scan, and triage of all remaining advisories have not been completed. Zero high/critical npm advisories alone is not a complete privacy or OWASP review. |

## Release follow-up

1. Integrate teammates' Sprint 3 changes; rerun CI and the checks above, then repeat authorization and input validation on the integrated application.
2. With the team's authorized deployment and test accounts, complete the hosted TLS, browser security, log/response, OWASP, secret-scan and privacy/network checks listed above. Record outcomes without secrets.
3. Review the outstanding development dependency advisories and document decisions; re-run the audits immediately before release.
4. Update Jira only after its acceptance criteria and the remaining environment-dependent checks are satisfied. Do not mark SEC-3 or CA-46 fully verified based only on local results.
