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



A disposable source database was used for this verification. The `backup\_verification` collection contained one test document with the following verification information:



\- Test case: `TC-SAF-02`

\- Purpose: `CA-47 backup and restore verification`

\- Status: `backup-source`

\- Created date: `2026-11-12`



\### Backup Procedure



A MongoDB backup was created from the disposable source database using `mongodump`. The backup completed successfully and produced the collection BSON data and metadata files.



\### Restore Procedure



The backup was restored into the separate database `chatapp\_ca47\_restored` using `mongorestore`. The restore completed successfully with one document restored and zero failures.



\### Verification Result



MongoDB Compass was used to verify the restored database. The database `chatapp\_ca47\_restored` contained the `backup\_verification` collection with the same test document as the source database.



\*\*Result: PASS\*\*



\## TC-SAF-01 — Database Outage and Recovery Verification



\### Objective



Verify that the running application correctly detects a MongoDB outage and reports recovery after the database service becomes available again.



\### Test Environment



\- Chat application running locally on port `3000`

\- MongoDB local Windows service

\- Database: `chatapp\_ca47\_test`

\- Health endpoint: `http://localhost:3000/health`



\### Test Procedure and Results



1\. \*\*Healthy baseline:\*\* With MongoDB running, the health endpoint returned a successful response with `db` reported as `connected`.



2\. \*\*Database outage:\*\* The MongoDB Windows service was stopped while the chat application remained running. The health endpoint returned HTTP `503` with `status` reported as `unavailable` and `db` reported as `disconnected`.



3\. \*\*Recovery:\*\* The MongoDB service was restarted without restarting the chat application. The health endpoint subsequently returned a successful response with `db` reported as `connected`.



\### Verification Result



The running application correctly detected the database outage and subsequently returned to a connected state after the MongoDB service was restarted.



\*\*Result: PASS\*\*



\## Remaining CA-47 Verification



The following CA-47 checks remain to be completed:



\- `TC-REL-01` — Reliability during extended operation and network interruptions.

\- `TC-USB-01` — Basic usability verification.

\- `TC-PRS-04` — Related performance and reliability verification.

\- Required browser compatibility and layout verification.



\## Current Status



\*\*CA-47 is partially completed.\*\* The SAF-4 database backup and restore requirement and the SAF-3 database outage and recovery verification have been successfully completed. The remaining reliability and usability checks must be completed before CA-47 can be marked as fully done.

