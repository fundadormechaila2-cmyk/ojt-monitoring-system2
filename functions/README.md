# Attendance QR Functions

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

Deploy Cloud Functions separately only if using QR attendance:

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
