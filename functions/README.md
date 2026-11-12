# Attendance QR Functions

## Account management

### Role-collection migration audit

The existing `students` documents are roster records and their document IDs
are referenced by assignments and attendance. Do not rename or delete them
without resolving those references. `users/{uid}` remains the current source
of role and account state; separate admin, coordinator, and supervisor
profiles are not yet maintained by the current application.

An emulator-only, read-only audit is available to identify missing role
profiles, role mismatches, misplaced non-student roster entries, and
conflicting student links. It prints document IDs and returns a nonzero exit
code when issues require review. It does not copy, change, or delete data:

```powershell
firebase emulators:exec --project demo-settings --only firestore "node functions\scripts\auditRoleCollections.js"
```

The audit must not be interpreted as a completed migration. Production data,
live rules, and all profile write paths need a separate reviewed migration
and deployment plan before role collections can be used as authoritative data.

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
screens. Only active administrators can create student accounts. Coordinators
can manage their assigned OJT records but cannot create student logins.

## Coordinator account registration

The OJT Coordinators page uses the secondary Firebase Authentication client
to create coordinator accounts without signing the administrator out. It
writes the `users/{uid}` profile under the existing administrator Firestore
rules, then sends a Firebase Authentication password-setup email. Firebase
generates the setup link; no temporary password is sent or saved. The page
also provides an Admin-only action to resend the setup email. This process
does not use Cloud Functions, SMTP secrets, or require billing.

## Student account registration and email

The Admin Dashboard creates student Authentication accounts directly through
the secondary Firebase Auth client and writes the linked `users/{uid}`,
`studentAccounts/{uid}`, and roster documents under the existing administrator
Firestore rules. It sends a Firebase Authentication password-reset email so
the student can set their own password. The temporary initial password is
never emailed or written to Firestore. Administrators can use **Resend password
setup email** to send another setup link. This student account creation and
setup-email flow does not require Cloud Functions, SMTP secrets, or a billing
plan that supports Cloud Functions.

The `createStudentAccount` and `resendStudentAccountNotification` callables
remain in this folder for deployments that still use the legacy callable flow;
the current Admin Dashboard no longer calls them.

To copy existing student profiles into the new collection without overwriting
documents already there, configure Firebase Admin credentials and run:

```powershell
node functions/scripts/syncStudentAccounts.js
```

Deploy Cloud Functions for account lifecycle operations with the command in
the root README. See that README for the exact PowerShell commands to start
the local backend and frontend.

The current React attendance flow generates and validates QR codes in the
browser and writes attendance through Firestore. These codes are not digitally
signed, and the current client-side nonce check is not a permanent replay
protection mechanism. The signed QR functions in this folder are not wired
into the current React flow; deploying them alone does not enable signed QR
attendance. Never place a signing secret in the React application.

Before deploying the signed QR functions, configure the secret once:

```powershell
firebase functions:secrets:set ATTENDANCE_QR_SECRET
```

Use a strong, randomly generated value of at least 32 bytes. The signed QR
flow requires Cloud Functions and corresponding client integration.

Compare the local Firestore rules against the live rules before deploying them;
the local rules may be older and could disrupt existing features.

Deploy Cloud Functions when enabling account deletion or the signed QR flow.

```powershell
firebase deploy --only functions --project ojt-monitoringsystem2
```

The student portal refreshes its current client-generated QR code
automatically. The supervisor scans it using the camera scanner, which records
attendance through the client-side attendance service. The supervisor
dashboard listens to attendance records in real time.

Camera access requires HTTPS (localhost is allowed during local development).
