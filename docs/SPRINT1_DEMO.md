# Sprint 1 Demo Recording Guide

Target length: approximately 1 minute. Record only after the app can connect to a disposable or approved MongoDB database and the two-user flow has been manually confirmed.

## Before recording

1. In PowerShell, open the repository folder and run `npm ci` once.
2. Copy `.env.example` to `.env`; set `MONGO_URI` to the database you are allowed to use and set `JWT_SECRET` to a long random value. Do not show `.env` or its values in the recording.
3. Run `npm start`. Open `http://localhost:3000/health` and confirm the database state says `connected`.
4. Open two separate browser profiles at `http://localhost:3000`. Create and sign in to Alice in the first profile and Bob in the second.
5. In Bob's browser developer console, copy the user ID with `JSON.parse(sessionStorage.getItem('chat.user')).userId`.
6. In Alice's browser developer console, create the private conversation using the copied ID:

```javascript
fetch('/api/conversations', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${sessionStorage.getItem('chat.token')}`
  },
  body: JSON.stringify({ participantId: 'PASTE_BOB_USER_ID_HERE' })
}).then((response) => response.json()).then(console.log)
```

7. Refresh both browser profiles so each conversation list loads the new chat. Keep the two browser windows visible side by side.

## One-minute narration and actions

- **0–8 seconds:** Show `/health` reporting the connected database, then switch to the two signed-in browser profiles.
- **8–18 seconds:** Point out that both users see the same private conversation.
- **18–32 seconds:** In Alice's chat pane, send “Hello Bob, Sprint 1 messaging is working.” Show it appear immediately for Alice and arrive in Bob's pane.
- **32–43 seconds:** Point out the sender, time, own-message styling, and SENT acknowledgement.
- **43–53 seconds:** Refresh Bob's page, reopen the conversation, and show the message in history.
- **53–60 seconds:** Show the successful test and lint output or the GitHub Actions check, if the workflow has completed.

If any step fails, stop the recording and report the failure. Do not use `?mock` as evidence of a working server-backed chat.
