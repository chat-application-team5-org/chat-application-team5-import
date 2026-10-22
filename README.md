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
- WebSocket messages use `ws://localhost:3000/ws`; send an `auth` event containing the JWT before other events

The authenticated browser shell loads recent messages, displays sender/time/status,
shows a pending message immediately, and replaces its status after the server's
persist-before-acknowledge response. Starting a new conversation from user search
and paging older history are not implemented yet.

## Project structure
```
src/
  server.js          entry point (HTTP + WebSocket)
  app.js             Express app (routes, middleware)
  config.js          environment configuration
  db/                MongoDB connection and Mongoose models
  middleware/        auth, validation, rate limiting, error handling
  ws/                WebSocket gateway
  modules/           auth, messaging, group, presence, history, status, profile
public/              web client (HTML/CSS/JS)
tests/               Jest tests
docs/                SRS, SAD, Test Plan, sprint backlog and demo guide
```
Module names match the architecture in the SAD (section 3.3).

## Team workflow
1. Pick the relevant task from the current sprint in the repository's GitHub Issues/project tracking.
2. Create a branch such as `feature/CA-14-data-models`; keep the task key in the branch and commit names when one is assigned.
3. Commit changes in small, focused steps.
4. Push the branch and open a pull request into `main`; another team member reviews it.
5. Merge after required reviews and checks pass, then update the corresponding GitHub task/status to reflect the actual result.

The file [`docs/JIRA_BACKLOG.md`](docs/JIRA_BACKLOG.md) is a historical snapshot from 7 October 2026, not the live task status. Use the current GitHub sprint/task tracking as the source of truth and refresh the snapshot when needed. The Sprint 1 demo guide and video are in [`docs/SPRINT1_DEMO.md`](docs/SPRINT1_DEMO.md) and [`docs/Team5_Sprint1_Chat_Demo.mp4.mp4`](docs/Team5_Sprint1_Chat_Demo.mp4.mp4).

Never commit `.env`, passwords or tokens.

## Team
| Name | SRN |
|---|---|
| Harsh Kalekar | PES1UG24CS183 |
| Chetha Samrutha | PES1UG24CS131 |
| Gagan | PES1UG24CS165 |
| Dhanush K S | PES1UG24CS148 |
