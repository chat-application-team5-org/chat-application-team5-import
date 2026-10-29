# Chat Application (Socket Programming) - Team 5

Real-time chat application built with Node.js, Express, `ws` (WebSockets) and MongoDB.
PES University, Department of Computer Science and Engineering - Software Engineering mini project.

Documents are in [`docs/`](docs): SRS, Software Architecture and Design Specification (SAD), Test Plan, sprint backlog snapshot, and demo guide.
Sprint tasks and code changes are tracked in GitHub Issues, sprint planning records, and pull requests in this repository.

## Prerequisites
- Node.js 20 LTS or later
- MongoDB 6.x running locally, or a MongoDB Atlas free-tier connection string

## Setup
```bash
npm ci
cp .env.example .env     # then edit .env (set JWT_SECRET and MONGO_URI)
npm start
```
Open http://localhost:3000 and check http://localhost:3000/health.
The WebSocket endpoint is `ws://localhost:3000/ws`.

For PowerShell, copy the environment template with `Copy-Item .env.example .env`.
Set `MONGO_URI` to a MongoDB database you control and replace `JWT_SECRET` with a
long random value before using real accounts. Never commit `.env`.

## Scripts
| Command | What it does |
|---|---|
| `npm start` | Start the server |
| `npm run dev` | Start with auto-reload (nodemon) |
| `npm test` | Run unit and integration tests (Jest) |
| `npm run test:coverage` | Tests with coverage report (target 70% of server logic) |
| `npm run test:integration` | MongoDB-backed registration, conversation, WebSocket, and history test (requires a disposable `chatapp_test` database) |
| `npm run lint` | Check code style (ESLint) |

The integration test deletes and recreates its database. It refuses to run unless
the database name is `chatapp_test` or begins with `chatapp_test_`. For local
verification, use a disposable MongoDB instance and a unique test database, such
as `MONGO_URI=mongodb://127.0.0.1:27017/chatapp_test_local`; set `JWT_SECRET` in
the shell before running the command. GitHub Actions provides its own temporary
MongoDB service for this test.

## Sprint 1 API

- `POST /api/auth/register` with `{ "username", "email", "password" }`
- `POST /api/auth/login` with `{ "identifier", "password" }` (username or email)
- `POST /api/auth/logout` with a bearer token
- `POST /api/conversations` with `{ "participantId" }` and a bearer token
- `GET /api/conversations` and `GET /api/conversations/:id/messages` with a bearer token
- WebSocket messages use `ws://localhost:3000/ws`; send an `auth` event containing the JWT before other events. The server emits `message:new` for online or pending messages; the receiving client sends `message:ack` with the persisted `messageId` to confirm delivery. The sender receives `message:status` updates for `SENT` and `DELIVERED`.

The authenticated browser shell loads the latest 50 messages, supports cursor-based loading of older history when scrolling to the top, displays sender/time/status, shows a pending message immediately, and replaces its status after the server's persist-before-acknowledge response. Starting a new conversation from user search is supported.

## Offline message delivery (CA-24)

Messages are written to MongoDB before the sender receives a `SENT` status. When an authenticated recipient connects, the server replays incoming messages that remain `SENT`. The client acknowledges a received message using `message:ack`; the server verifies that the acknowledger is a conversation participant other than the sender, records `DELIVERED`, and notifies the sender's active WebSocket sessions. If a client disconnects before its acknowledgement reaches the server, the message remains pending and is replayed on a later connection. Replays are at-least-once until acknowledged; the UI de-duplicates by persisted message ID, and the REST history remains durable.

## Project structure
```
src/
  server.js          entry point (HTTP + WebSocket)
  app.js             Express app (routes, middleware)
  config.js          environment configuration
  modules/            auth, messaging and users
  models/             User, Conversation, Message
public/               browser client
tests/                unit and MongoDB-backed integration tests
docs/                 SRS, SAD, Test Plan and sprint records
```
