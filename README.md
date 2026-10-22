# Chat Application (Socket Programming) - Team 5

Real-time chat application built with Node.js, Express, `ws` (WebSockets) and MongoDB.
PES University, Department of Computer Science and Engineering - Software Engineering mini project.

Documents are in [`docs/`](docs): SRS, Software Architecture and Design Specification (SAD) and Test Plan.
Work is tracked in Jira project **CA** (Chat Application).

## Prerequisites
- Node.js 20 LTS or later
- MongoDB 6.x running locally, or a MongoDB Atlas free-tier connection string

## Setup
```bash
npm install
cp .env.example .env     # then edit .env (set JWT_SECRET and MONGO_URI)
npm start
```
Open http://localhost:3000 and check http://localhost:3000/health.
The WebSocket endpoint is `ws://localhost:3000/ws`.

## Scripts
| Command | What it does |
|---|---|
| `npm start` | Start the server |
| `npm run dev` | Start with auto-reload (nodemon) |
| `npm test` | Run unit and integration tests (Jest) |
| `npm run test:coverage` | Tests with coverage report (target 70% of server logic) |
| `npm run lint` | Check code style (ESLint) |

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
docs/                SRS, SAD, Test Plan
```
Module names match the architecture in the SAD (section 3.3).

## Team workflow
1. Pick an issue from the current sprint on the Jira board and move it to **In Progress**.
2. Create a branch: `feature/CA-<number>-short-name` (for example `feature/CA-14-data-models`).
3. Commit often with the Jira key in the message: `CA-14: add User model`.
4. Push and open a pull request into `main`; another team member reviews it.
5. Merge when lint and tests pass, then move the Jira issue to **Done**.

Never commit `.env`, passwords or tokens.

## Team
| Name | SRN |
|---|---|
| Harsh Kalekar | PES1UG24CS183 |
| Chetha Samrutha | PES1UG24CS131 |
| Gagan Eswar | PES1UG24CS165 |
| Dhanush | PES1UG24CS148 |
