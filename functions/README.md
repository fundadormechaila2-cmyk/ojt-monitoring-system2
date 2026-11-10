# Attendance QR Functions

## Account management

`manageAccountApi` is the trusted HTTP backend for account lifecycle
operations; it verifies the Firebase ID token from the Bearer authorization
header before invoking the shared account-management logic. The callable
`manageAccount` remains available for compatibility. In Cloud Functions, the
Admin SDK uses the function's service identity. For local
development, the root `npm run account-server` script starts
`localAccountServer.js`; set `GOOGLE_APPLICATION_CREDENTIALS` to a Firebase
Admin service-account key stored outside the repository and set
`GCLOUD_PROJECT=ojt-monitoringsystem2`. The server verifies Firebase ID tokens and checks the caller's active Firestore
profile before acting. Permanent deletion is restricted to administrators.
Deleting a student removes that student's Authentication account, profile,
roster record, attendance, QR scan records, journals, evaluations,
applications, login activity, and nested documents linked to the student.
Related student records are removed only when their UID, roster ID, or unique
student ID matches the selected student. If cleanup fails after the account is
locked, retry deletion from the student list to finish the recorded operation.

Student login profiles are also written to `studentAccounts/{uid}` so student
accounts have a dedicated Firestore collection. The `users/{uid}` profile
remains in place for role checks and backwards compatibility with existing
screens. Coordinator-created accounts are only allowed when their assigned
student roster record belongs to that coordinator.

To copy existing student profiles into the new collection without overwriting
documents already there, configure Firebase Admin credentials and run:

```powershell
node functions/scripts/syncStudentAccounts.js
```

Deploy both Cloud Functions with the command in the root README. See that
README for the exact PowerShell commands to start the local backend and
frontend.

Student QR codes are signed by Firebase Functions and validated by the
server before attendance is written. Never place the signing secret in the
React application.

Before deploying, configure the secret once:

```powershell
firebase functions:secrets:set ATTENDANCE_QR_SECRET
```

Use a strong, randomly generated value of at least 32 bytes. Cloud Functions
are only needed for the QR attendance features; assigning coordinators uses
Firestore directly and does not require Cloud Functions or billing.

```powershell
firebase deploy --only firestore:rules --project ojt-monitoringsystem2
```

Deploy Cloud Functions when enabling student account creation/deletion or QR
attendance:

```powershell
firebase deploy --only functions --project ojt-monitoringsystem2
```

The student portal refreshes each student's signed QR token every 30 seconds.
The supervisor scans it using the camera scanner. The function derives the
student and supervisor identities from Firebase Authentication, validates the
signature, expiry, roles, and one-time nonce, then records Time-In on the
student's first scan and Time-Out on the next scan that day. The supervisor
dashboard listens to attendance records in real time.

Camera access requires HTTPS (localhost is allowed during local development).
