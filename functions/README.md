# Attendance QR Functions

## Account management

### Role-collection migration audit

The existing `students` documents are roster records and their document IDs
are referenced by assignments and attendance. Do not rename or delete them
without resolving those references. `users/{uid}` remains the current source
of role and account state.

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

Account profiles are stored by role under the Firebase Auth UID:
`coordinatorsAccount/{uid}`, `supervisorsAccount/{uid}` and
`studentsAccount/{uid}`. A coordinator is never written to the supervisor or
student collection, and so on. The `users/{uid}` profile remains in place for
role checks and backwards compatibility with existing screens, and is the only
place access state is authoritative. The `mirrorRoleAccount` trigger keeps the
role collections in sync with `users/{uid}` (it also strips password fields), and
`node scripts/syncRoleAccounts.js` backfills accounts that existed before. Only
active administrators can create student accounts. Coordinators
can manage their assigned OJT records but cannot create student logins.

## Student and coordinator registration

The Admin Dashboard uses a secondary Firebase Auth client to create student
and coordinator logins while retaining the administrator's session. It writes
`users/{uid}` and the matching `studentsAccount/{uid}` or
`coordinatorsAccount/{uid}` profile, links the student roster when applicable,
and requests a Firebase Authentication password-reset email. The recipient
sets their password using that link before signing in. The generated initial
password is not emailed, stored in Firestore, or shown in the UI.

This flow requires Email/Password authentication and appropriate administrator
Firestore rules, but does not require Cloud Functions or SMTP secrets. The
dashboard reports email request failures separately from account creation; use
the resend action to request another link. Resending does not immediately
change an existing password. Firebase accepting a request does not guarantee
that a message reaches the recipient's inbox.

Firebase Auth sign-up itself is available to clients when Email/Password is
enabled. Firestore rules must restrict profile creation and data access to
authorized users; an Auth account alone must not grant an application role.
The initial password is generated in the administrator's browser, so this is
not equivalent to backend-only account creation or a server-enforced
first-login password change.

Existing accounts with `mustChangePassword: true` still use the
`completePasswordChange` Cloud Function and cannot be migrated merely by
resending a reset link. This includes any legacy supervisor or student
accounts using temporary passwords. Deploy that function and the compatible
Firestore rules before relying on that legacy workflow; do not clear the flag
without verifying the password change. The optional SMTP-based account
registration functions in this folder are no longer called by the dashboard.

Compare local and live Firestore rules before deployment; replacing the live
rules with an older complete rules file can disrupt other features. After
verifying the live rules allow administrators to create the account profiles,
deploy the frontend:

```powershell
firebase deploy --only hosting --project ojt-monitoringsystem2
```

Test account creation and setup links with the Auth and Firestore emulators:

```powershell
firebase emulators:exec --project demo-account-setup --only "auth,firestore" "node --test tests\account-setup-emulator.test.js"
```

After deployment, verify both roles using real test mailboxes; emulator tests
cannot establish production email delivery, permissions, or live rules.

## Supervisor registration

The coordinator dashboard creates a supervisor with a secondary Firebase Auth
client, writes `users/{uid}`, `supervisorsAccount/{uid}`, and
`supervisors/{uid}`, and assigns selected students in one Firestore transaction.
It then requests a Firebase Authentication password-reset email. The supervisor
uses the link to set a password before signing in. The generated initial
password is not emailed, stored in Firestore, or shown in the UI.

The creating coordinator can use **Retry email** after a failed request. A
successful request does not guarantee inbox delivery. If notification status
cannot be saved, contact an administrator instead of creating a duplicate
account. Accounts from the older temporary-password workflow still require the
password-change Cloud Function; retrying a setup link does not migrate them.

The initial password is generated in the coordinator's browser. Unlike a
trusted backend workflow, Firebase cannot enforce that the recipient changes
it before first login or prevent the coordinator from inspecting it. This
approach requires Email/Password authentication, the appropriate Firestore
rules, and Firebase's email quota, but no SMTP secrets or Cloud Functions.
Firebase Auth sign-up is available to clients, so Firestore rules must prevent
unauthorized profile creation.

The repository rules differ from production and must not be deployed wholesale.
Merge and review the narrowly scoped supervisor setup rules against the current
production rules before deploying. Verify both the emulator flow and delivery
to a real test Gmail mailbox; emulator success does not prove inbox delivery.

```powershell
firebase emulators:exec --config firebase.account-setup-emulator.json --project demo-account-setup --only "auth,firestore" "node --test tests\supervisor-setup-emulator.test.js"
```

To copy existing coordinator, supervisor and student profiles into their role
collections without overwriting documents already there, configure Firebase
Admin credentials and run:

```powershell
node functions/scripts/syncRoleAccounts.js
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

The signed QR and manual attendance callables accept `amIn`, `amOut`, `pmIn`,
`pmOut`, `otIn`, and `otOut` as period values. Manual attendance also accepts
`overtimeIn` and `overtimeOut`. Each period is recorded once per Manila date.
QR scans use server time; manual attendance uses the selected date and `HH:mm`
time, rejects future dates, and records the supervisor and server audit time.
Time-outs require their matching time-in,
and overtime requires PM Out. The callables retain the legacy `timeIn`,
`timeOut`, and `hours` fields and include completed overtime in `totalHours`.
The signed QR callable also retains its legacy no-period Time-In/Time-Out mode
for records without session fields. The current browser attendance flow is
separate and is not changed by these callables.

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
