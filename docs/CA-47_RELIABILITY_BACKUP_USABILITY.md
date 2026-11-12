\# CA-47 — Reliability, Backup/Restore and Usability Verification



\## Purpose



This document records the verification activities and evidence for CA-47: Reliability, backup/restore and usability verification, covering the applicable SAF-3, SAF-4 and quality attribute requirements.



\## Test Scope



CA-47 requires verification of:



\- Reliability during extended operation and network interruptions.

\- Database outage and recovery behaviour (SAF-3).

\- Database backup and documented restore procedure (SAF-4).

\- Basic usability verification.

\- Compatibility with the required browser and layout conditions.



\---



\## TC-SAF-02 — Database Backup and Restore Verification



\### Objective



Verify that a MongoDB database backup can be created successfully and restored into a separate database without losing the backed-up data.



\### Test Environment



\- MongoDB local server: `127.0.0.1:27017`

\- Source database: `chatapp\_ca47\_test`

\- Restored database: `chatapp\_ca47\_restored`

\- MongoDB Database Tools: version `100.20.1`

\- Test collection: `backup\_verification`



\### Test Data



A disposable source database was used for this verification. The `backup\_verification` collection contained one test document with the following values:



\- Test case: `TC-SAF-02`

\- Purpose: `CA-47 backup and restore verification`

\- Status: `backup-source`

\- Created date: `2026-11-12`



\### Backup Procedure



The MongoDB backup was created using `mongodump`:



`mongodump --uri="mongodb://127.0.0.1:27017" --db="chatapp\_ca47\_test" --out=".\\ca47\_backup"`



The backup completed successfully and created the database backup files, including:



\- `backup\_verification.bson`

\- `backup\_verification.metadata.json`

\- `prelude.json`



The backup output confirmed that one document was dumped successfully.



\### Restore Procedure



The backup was restored into a separate database using `mongorestore`:



`mongorestore --uri="mongodb://127.0.0.1:27017" --nsFrom="chatapp\_ca47\_test.\*" --nsTo="chatapp\_ca47\_restored.\*" ".\\ca47\_backup"`



The restore output confirmed:



\- The collection metadata was read successfully.

\- The `backup\_verification` collection was restored successfully.

\- 1 document was restored.

\- 0 documents failed to restore.



\### Restore Verification



MongoDB Compass was used to verify both databases.



The source database, `chatapp\_ca47\_test`, contained the original `backup\_verification` document.



The restored database, `chatapp\_ca47\_restored`, also contained the same document with the same test data.



This confirms that the backup data was successfully restored into a separate database.



\### Result



\*\*PASS\*\*



The database backup and restore procedure was successfully verified. One document was backed up and restored successfully with no restore failures.



\---



\## TC-SAF-01 — Database Outage and Recovery Verification



\### Objective



Verify that the application safely reports database unavailability when MongoDB becomes unavailable and recovers when the database service is restored.



\### Test Environment



\- Application server: `http://localhost:3000`

\- MongoDB service: Windows MongoDB service

\- Health endpoint: `/health`



\### Normal Operation Verification



Before the database outage, the health endpoint returned:



`{"status":"ok","uptime":66.7033659,"db":"connected"}`



This confirmed that the application was running and connected to MongoDB.



\### Database Outage Verification



The MongoDB service was stopped.



The service status was verified as:



`Stopped`



The application health endpoint was then checked. It reported:



`{"status":"unavailable","uptime":360.7397337,"db":"disconnected"}`



This confirmed that the application detected the database outage and safely reported an unavailable state rather than incorrectly reporting that the database was connected.



\### Recovery Verification



The MongoDB service was restarted.



The service status was verified as:



`Running`



The health endpoint was checked again and returned:



`{"status":"ok","uptime":447.4316621,"db":"connected"}`



This confirmed that the application recovered its database connectivity after the MongoDB service was restored.



\### Result



\*\*PASS\*\*



The application correctly reported database unavailability during the MongoDB outage and returned to a connected state after the database service was restarted.



\---



\## TC-REL-01 — Gateway Reliability Test Verification



\### Objective



Verify the automated reliability checks implemented for the WebSocket gateway.



\### Test Execution



The gateway test suite was executed using:



`npm.cmd test -- tests/gateway.test.js`



\### Test Result



The test execution completed with the following result:



\- Test Suites: 1 passed, 1 total

\- Tests: 28 passed, 28 total

\- Snapshots: 0 total

\- Execution time: 21.943 seconds



The automated gateway test suite completed successfully with no test failures.



\### Result



\*\*PASS\*\*



The existing automated gateway reliability tests passed successfully. This provides verification evidence for gateway connection and disconnection behaviour covered by the test suite.



\---



\## Evidence Summary



| Test Case | Verification | Result |

|---|---|---|

| TC-SAF-01 | Database outage and recovery behaviour | PASS |

| TC-SAF-02 | Database backup and restore | PASS |

| TC-REL-01 | Automated gateway reliability tests | PASS |



\## Remaining CA-47 Verification



The following CA-47 checks remain to be completed:



\- Extended reliability/soak verification with the required clients and network interruption conditions.

\- `TC-USB-01` — Basic usability verification.

\- `TC-PRS-04` — Related performance and reliability verification.

\- Required browser compatibility and layout verification, including the specified browser and viewport conditions.



\## Current Status



\*\*CA-47 is partially completed.\*\*



The following verification activities have been successfully completed:



\- SAF-3 database outage and recovery verification.

\- SAF-4 database backup and restore verification.

\- Automated gateway reliability testing with 28 out of 28 tests passing.



The remaining extended reliability, usability, performance-related, browser compatibility and layout checks must be completed before CA-47 can be marked as fully complete.

\## TC-USB-01 — Basic Usability and Browser/Layout Verification



\### Objective



Verify that the Chat Application provides a clear and usable interface and that the required layout functions correctly in a supported browser.



\### Verification Performed



The application was opened successfully in Microsoft Edge at `http://localhost:3000`.



The following usability checks were completed:



\- The Login page loaded successfully.

\- The Register page was accessible from the Login page.

\- Username, email and password input fields were clearly visible and usable.

\- Login and Register buttons were clearly displayed.

\- Navigation between Login and Register screens worked correctly.

\- The application layout remained readable and usable when the browser window was reduced in size.



\### Result



\*\*PASS\*\* — The basic user interface and navigation were successfully verified in Microsoft Edge. The Login and Register screens were accessible, readable and usable, including in a reduced browser window.

