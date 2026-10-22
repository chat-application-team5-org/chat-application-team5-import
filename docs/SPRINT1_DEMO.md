# Sprint 1 Demo Recording Guide

Target length: approximately 1 minute. Record only after the app can connect to a disposable or approved MongoDB database and the two-user flow has been manually confirmed.

## Before recording

1. In PowerShell, open the repository folder and run `npm ci` once.
2. Copy `.env.example` to `.env`; set `MONGO_URI` to the database you are allowed to use and set `JWT_SECRET` to a long random value. Do not show `.env` or its values in the recording.
3. Run `npm start`. Open `http://localhost:3000/health` and confirm the database state says `connected`.
4. Open two separate browser profiles at `http://localhost:3000`. Sign in to the demo-only Alice account in one profile and Bob in the other. Confirm both show **Connected**.
5. In Alice's profile, type `b` in **Search users** and select Bob from the results to open the private conversation.
6. Keep both browser windows visible side by side. In Alice's chat pane, send “Hi Bob! This is Alice. Testing our chat application.” Confirm Bob receives it.
7. Refresh Bob's profile, reopen the conversation, and confirm the message remains in history.

## One-minute narration and actions

- **0–7 seconds:** Show `/health` reporting `status: ok` and `db: connected`.
- **7–17 seconds:** Show Alice and Bob signed in and connected. Type `b` in Alice's search box, select Bob, and show the private conversation.
- **17–31 seconds:** Alice sends “Hi Bob! This is Alice. Testing our chat application.” Show it arrive in Bob's pane.
- **31–40 seconds:** Point out the sender, time, and `SENT` status.
- **40–50 seconds:** Refresh Bob's page, reopen the conversation, and show the message remains in history.
- **50–60 seconds:** Show the successful GitHub Actions check. Mention that the same message was also verified after an app-server restart.

If any step fails, stop the recording and report the failure. Do not use `?mock` as evidence of a working server-backed chat.

## Verification record

Manual verification reported by the team on 22 October 2026:

- Alice and Bob registered and connected in separate Chrome and Edge browsers.
- Searching for `b` returned Bob, and Alice opened a private conversation with him.
- Alice sent “Hi Bob! This is Alice. Testing our chat application.” Bob received it.
- The message remained visible after refreshing Bob's browser.
- The same message remained visible after restarting the app server and reconnecting. After the restart, `/health` returned `status: ok` and `db: connected`.

Automated and other verification status:

- **Unit tests:** 10 suites and 60 tests passed locally on the CA-39 search-fix branch.
- **Lint:** passed locally on the CA-39 search-fix branch.
- **MongoDB integration:** passed in GitHub Actions for the merged Sprint 1 PR. It covers authenticated two-user WebSocket delivery, the `SENT` acknowledgement, MongoDB persistence, and message history after an app-server restart. It was not rerun locally for this demo because the integration test clears its disposable test database.
- **Performance targets:** not tested; no latency or concurrent-user target is claimed as passed.
- **Demo video:** not yet recorded or uploaded.
