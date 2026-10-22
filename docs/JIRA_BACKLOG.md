# GitHub Sprint Backlog Snapshot - Chat Application (Team 5)

This file preserves the team's planning/backlog snapshot originally exported on 7 October 2026 from Jira project CA. It is retained as historical planning context; the team uses GitHub sprint/task tracking, issues, and pull requests for current work. **Statuses in the tables below are from the 7 October snapshot and are not current-status claims.** Check the live GitHub task tracking before acting on any status.

**10 epics, 39 stories/tasks** (5 marked done in the 7 October snapshot). Requirement IDs (REQ, PERF, SAF, SEC) refer to the SRS; test case IDs are in the Test Plan.

## Sprint plan summary

| Sprint | Items | Focus |
|---|---|---|
| Sprint 1 | 15 | Repo, CI, data models, UI shell; auth (register, login, lockout, WebSocket auth, logout); open chat, real-time delivery, validation, message display, persistence |
| Sprint 2 | 14 | Offline delivery, XSS sanitising, paged history, groups, presence, typing, heartbeat, reconnect, status ticks, user search, error handling, tests |
| Sprint 3 | 10 | Group admin, unread counts and notifications, profile and password, rate limiting, TLS, performance, security and reliability testing, documentation and demo |

## Team and ownership

| Member | SRN | Area |
|---|---|---|
| Gagan Eswar | PES1UG24CS165 | Authentication and security |
| Chetha Samrutha | PES1UG24CS131 | Messaging, history, performance |
| Harsh Kalekar | PES1UG24CS183 | Groups, profile, UI and usability |
| Dhanush K S | PES1UG24CS148 | Presence, status, reliability |

## Backlog by epic

### CA-1: Project Setup and DevOps

| Key | Type | Summary | Priority | Sprint | Assignee | Status (7 Oct snapshot) |
|---|---|---|---|---|---|---|
| CA-12 | Task | Initialise repository, module structure, ESLint, Jest and npm start | High | Sprint 1 | Harsh Kalekar | Done |
| CA-13 | Task | Set up CI pipeline: lint and tests on every pull request | High | Sprint 1 | Dhanush K S | To Do |
| CA-14 | Task | Data Access Layer: Mongoose models, indexes and seed scripts | High | Sprint 1 | Chetha Samrutha | Done |
| CA-15 | Task | Web client shell: login/register and Chat Home screens | High | Sprint 1 | Harsh Kalekar | To Do |

### CA-2: User Registration and Authentication

| Key | Type | Summary | Priority | Sprint | Assignee | Status (7 Oct snapshot) |
|---|---|---|---|---|---|---|
| CA-11 | Story | Register with validation (REQ-1, REQ-2) | High | Sprint 1 | Gagan | To Do |
| CA-16 | Story | Store passwords as salted bcrypt hashes (REQ-3, SEC-2) | High | Sprint 1 | Gagan | To Do |
| CA-17 | Story | Login with username or email and 24-hour JWT (REQ-4) | High | Sprint 1 | Gagan | To Do |
| CA-18 | Story | Generic login error and 15-minute lockout after 5 failures (REQ-5) | High | Sprint 1 | Gagan | To Do |
| CA-19 | Story | Authenticated WebSocket connection with auth event and Origin check (REQ-6) | High | Sprint 1 | Dhanush K S | To Do |
| CA-20 | Story | Logout closes WebSocket and discards token (REQ-7) | High | Sprint 1 | Dhanush K S | To Do |

### CA-3: One-to-One Real-Time Messaging

| Key | Type | Summary | Priority | Sprint | Assignee | Status (7 Oct snapshot) |
|---|---|---|---|---|---|---|
| CA-21 | Story | Open or create a private conversation with another user (REQ-8) | High | Sprint 1 | Chetha Samrutha | Done |
| CA-22 | Story | Real-time delivery of messages over WebSocket (REQ-9) | High | Sprint 1 | Chetha Samrutha | In Progress |
| CA-23 | Story | Message validation: 1 to 2,000 characters, no blank messages (REQ-10) | High | Sprint 1 | Chetha Samrutha | Done |
| CA-24 | Story | Store and deliver messages to offline recipients (REQ-11) | High | Sprint 2 | - | To Do |
| CA-25 | Story | Message pane shows sender, time, status and own messages (REQ-12) | High | Sprint 1 | Harsh Kalekar | To Do |
| CA-26 | Story | Sanitise message content to prevent XSS (REQ-13, SEC-4) | High | Sprint 2 | - | To Do |

### CA-4: Group Chat

| Key | Type | Summary | Priority | Sprint | Assignee | Status (7 Oct snapshot) |
|---|---|---|---|---|---|---|
| CA-29 | Story | Create a group with name and members; creator becomes admin (REQ-14) | High | Sprint 2 | - | To Do |
| CA-30 | Story | Group message broadcast with sender name (REQ-15, REQ-17) | High | Sprint 2 | - | To Do |
| CA-31 | Story | Membership authorisation on every conversation read and write (REQ-18, SEC-5) | High | Sprint 2 | - | To Do |
| CA-32 | Story | Group admin actions: add, remove, rename; member can leave (REQ-16) | High | Sprint 3 | - | To Do |

### CA-5: Presence, Typing and Connection Handling

| Key | Type | Summary | Priority | Sprint | Assignee | Status (7 Oct snapshot) |
|---|---|---|---|---|---|---|
| CA-33 | Story | Online/offline presence with last-seen (REQ-19) | Medium | Sprint 2 | - | To Do |
| CA-34 | Story | Typing indicator (REQ-20) | Medium | Sprint 2 | - | To Do |
| CA-35 | Story | Ping/pong heartbeat marks broken connections offline within 40 s (REQ-21) | Medium | Sprint 2 | - | To Do |
| CA-36 | Story | Auto reconnect with exponential back-off and message re-sync (REQ-22) | Medium | Sprint 2 | - | To Do |

### CA-6: Chat History and Persistence

| Key | Type | Summary | Priority | Sprint | Assignee | Status (7 Oct snapshot) |
|---|---|---|---|---|---|---|
| CA-27 | Story | Persist every message before acknowledging it (REQ-23, SAF-1) | High | Sprint 1 | Chetha Samrutha | Done |
| CA-28 | Story | Load latest 50 messages and page older history on scroll (REQ-24) | High | Sprint 2 | - | To Do |

### CA-7: Delivery Status and Unread Notifications

| Key | Type | Summary | Priority | Sprint | Assignee | Status (7 Oct snapshot) |
|---|---|---|---|---|---|---|
| CA-37 | Story | Sent, delivered and read status ticks in real time (REQ-25, REQ-26) | Medium | Sprint 2 | - | To Do |
| CA-38 | Story | Unread counters and in-app notifications (REQ-27, REQ-28) | Medium | Sprint 3 | - | To Do |

### CA-8: Profile Management and User Search

| Key | Type | Summary | Priority | Sprint | Assignee | Status (7 Oct snapshot) |
|---|---|---|---|---|---|---|
| CA-39 | Story | Search users by partial username and start a chat (REQ-31) | Low | Sprint 2 | - | To Do |
| CA-40 | Story | View and edit display name and status message (REQ-29) | Low | Sprint 3 | - | To Do |
| CA-41 | Story | Change password after verifying the current one (REQ-30) | Low | Sprint 3 | - | To Do |

### CA-9: Security and Hardening

| Key | Type | Summary | Priority | Sprint | Assignee | Status (7 Oct snapshot) |
|---|---|---|---|---|---|---|
| CA-42 | Story | Rate limiting and frame size limit (SAF-2) | High | Sprint 3 | - | To Do |
| CA-43 | Story | TLS (https/wss), secrets handling and dependency audit (SEC-3, SEC-8) | High | Sprint 3 | - | To Do |
| CA-44 | Story | Central error handling, safe logging and health endpoint (SAF-3, SEC-2) | High | Sprint 2 | - | To Do |
| CA-46 | Task | Execute security validation checks (STP 5.1, SEC-1 to SEC-8) | High | Sprint 3 | - | To Do |

### CA-10: Testing, NFR Verification and Documentation

| Key | Type | Summary | Priority | Sprint | Assignee | Status (7 Oct snapshot) |
|---|---|---|---|---|---|---|
| CA-45 | Task | Performance and load tests: latency, 100 clients, page load (PERF-1 to PERF-5) | High | Sprint 3 | - | To Do |
| CA-47 | Task | Reliability, backup/restore and usability verification (SAF-3, SAF-4, quality attributes) | Medium | Sprint 3 | - | To Do |
| CA-48 | Task | Unit and integration test suites, 70% coverage and RTM updates | High | Sprint 2 | - | To Do |
| CA-49 | Task | Documentation, test summary report and demo preparation | Medium | Sprint 3 | - | To Do |

---

Review this snapshot against the live GitHub sprint/task tracking before relying on any status. Refresh the snapshot at the end of each sprint.