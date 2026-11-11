const { getAuth } = require("firebase-admin/auth");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const { defineSecret } = require("firebase-functions/params");
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const nodemailer = require("nodemailer");
const { isAccountLive } = require("./accountState");
const { departmentIdFor } = require("./departments");
const { generateTemporaryPassword } = require("./temporaryPassword");

const SMTP_HOST = defineSecret("SMTP_HOST");
const SMTP_PORT = defineSecret("SMTP_PORT");
const SMTP_USER = defineSecret("SMTP_USER");
const SMTP_PASSWORD = defineSecret("SMTP_PASSWORD");
const SMTP_FROM = defineSecret("SMTP_FROM");
const notificationSecrets = [
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASSWORD,
  SMTP_FROM,
];

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function getLoginUrl() {
  return process.env.APP_LOGIN_URL ||
    `https://${process.env.GCLOUD_PROJECT || "ojt-monitoringsystem2"}.web.app/login`;
}

function buildNotification({ email, fullName, password }) {
  const loginUrl = getLoginUrl();
  const safeName = escapeHtml(fullName);
  const safeEmail = escapeHtml(email);
  const safePassword = escapeHtml(password);
  const safeLoginUrl = escapeHtml(loginUrl);

  return {
    subject: "Your LCC I OJT Monitoring System account",
    text: [
      `Welcome to the LCC I OJT Monitoring System, ${fullName}.`,
      "",
      `Username: ${email}`,
      `Temporary password: ${password}`,
      `Login: ${loginUrl}`,
      "",
      "Sign in with your registered email address and temporary password. You will be asked to create a new password before continuing. Keep your password private.",
    ].join("\n"),
    html: `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f4f6f8;font-family:Arial,sans-serif;color:#202b3c">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 12px;background:#f4f6f8">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden">
          <tr><td style="padding:24px 32px;background:#143b64;color:#ffffff">
            <div style="font-size:13px;font-weight:bold;letter-spacing:2px">LCC I</div>
            <div style="margin-top:8px;font-size:23px;font-weight:bold">OJT Monitoring System</div>
          </td></tr>
          <tr><td style="padding:32px">
            <h1 style="margin:0 0 16px;font-size:22px">Welcome, ${safeName}!</h1>
            <p style="margin:0 0 22px;line-height:1.6">Your student account has been created. Use the credentials below to access your OJT Monitoring System account.</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:24px;background:#f5f8fc;border:1px solid #dce5ef;border-radius:8px">
              <tr><td style="padding:16px 18px;font-size:14px;line-height:1.8">
                <strong>Username</strong><br>${safeEmail}<br><br>
                <strong>Temporary password</strong><br><span style="font-family:monospace;font-size:16px">${safePassword}</span>
              </td></tr>
            </table>
            <p style="margin:0 0 22px;line-height:1.6">Select the button below and sign in using your registered email address and temporary password. You will be required to change this password on your first login. Do not share your password.</p>
            <p style="margin:0 0 24px"><a href="${safeLoginUrl}" style="display:inline-block;padding:13px 22px;border-radius:6px;background:#1f65ad;color:#ffffff;text-decoration:none;font-weight:bold">Login Now</a></p>
            <p style="margin:0;color:#667085;font-size:13px;line-height:1.6">If the button does not work, copy this link into your browser:<br><a href="${safeLoginUrl}" style="color:#1f65ad">${safeLoginUrl}</a></p>
          </td></tr>
          <tr><td style="padding:18px 32px;background:#f8fafc;color:#667085;font-size:12px">LCC I · OJT Monitoring System</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`,
  };
}

async function sendAccountNotification(credentials) {
  const port = Number(SMTP_PORT.value());
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SMTP_PORT must be a valid TCP port.");
  }
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST.value(),
    port,
    secure: port === 465,
    auth: { user: SMTP_USER.value(), pass: SMTP_PASSWORD.value() },
  });
  await transporter.sendMail({
    from: SMTP_FROM.value(),
    to: credentials.email,
    ...buildNotification(credentials),
  });
}

async function requireAdministrator(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in as an administrator to manage student accounts.");
  }
  const db = getFirestore();
  const snapshot = await db.collection("users").doc(request.auth.uid).get();
  const profile = snapshot.exists ? snapshot.data() : null;
  if (!profile || profile.role !== "admin" || !isAccountLive(profile)) {
    throw new HttpsError("permission-denied", "Only active administrators can create or resend student account notifications.");
  }
  return { db, adminUid: request.auth.uid };
}

function studentName(profile, roster) {
  const firstName = String(profile.firstName || roster.firstName || "").trim();
  const lastName = String(profile.lastName || roster.lastName || "").trim();
  return `${firstName} ${lastName}`.trim() || String(roster.name || "").trim();
}

async function writeNotificationStatus(db, uid, studentRecordId, status) {
  const timestamp = FieldValue.serverTimestamp();
  const batch = db.batch();
  const changes = {
    accountNotificationStatus: status,
    accountNotificationUpdatedAt: timestamp,
    updatedAt: timestamp,
  };
  batch.set(db.collection("users").doc(uid), changes, { merge: true });
  batch.set(db.collection("studentAccounts").doc(uid), changes, { merge: true });
  batch.set(db.collection("students").doc(studentRecordId), changes, { merge: true });
  await batch.commit();
}

async function deliverNotification(db, uid, studentRecordId, credentials) {
  try {
    await sendAccountNotification(credentials);
    await writeNotificationStatus(db, uid, studentRecordId, "Sent");
    return "Sent";
  } catch (error) {
    logger.error("Student account notification delivery failed", {
      uid,
      studentRecordId,
      error: String(error.message || error),
    });
    await writeNotificationStatus(db, uid, studentRecordId, "Failed");
    return "Failed";
  }
}

async function createStudentAccountHandler(request) {
  const { db, adminUid } = await requireAdministrator(request);
  const data = request.data || {};
  const studentRecordId = String(data.studentRecordId || "").trim();
  const firstName = String(data.firstName || "").trim();
  const lastName = String(data.lastName || "").trim();
  const email = String(data.email || "").trim().toLowerCase();
  if (!studentRecordId || !firstName || !lastName || !email) {
    throw new HttpsError("invalid-argument", "Student record, first name, last name, and email are required.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpsError("invalid-argument", "Enter a valid student email address.");
  }

  const rosterRef = db.collection("students").doc(studentRecordId);
  const rosterSnapshot = await rosterRef.get();
  if (!rosterSnapshot.exists) {
    throw new HttpsError("not-found", "The student roster record no longer exists.");
  }
  const roster = rosterSnapshot.data();
  const linkedUid = roster.studentUid || roster.userUid || roster.accountUid;
  if (linkedUid) {
    const linkedProfile = await db.collection("users").doc(linkedUid).get();
    if (linkedProfile.exists && linkedProfile.data().role === "student") {
      return {
        uid: linkedUid,
        email: linkedProfile.data().email || email,
        role: "student",
        alreadyExists: true,
        emailStatus: linkedProfile.data().accountNotificationStatus || "Unknown",
      };
    }
    throw new HttpsError("failed-precondition", "This student record has an unresolved account link. Ask an administrator to review it.");
  }

  const priorProfile = await db.collection("users")
    .where("studentRecordId", "==", studentRecordId)
    .limit(1)
    .get();
  if (!priorProfile.empty) {
    throw new HttpsError("failed-precondition", "A student account already exists for this roster record. Repair the roster link before retrying.");
  }

  const departmentId = departmentIdFor(roster.course || data.course);
  const coordinatorUid = String(roster.coordinatorUid || data.coordinatorUid || "").trim();
  let coordinatorName = String(roster.coordinatorName || data.coordinatorName || "").trim();
  if (coordinatorUid) {
    const coordinatorSnapshot = await db.collection("users").doc(coordinatorUid).get();
    if (
      !coordinatorSnapshot.exists ||
      coordinatorSnapshot.data().role !== "coordinator" ||
      !isAccountLive(coordinatorSnapshot.data())
    ) {
      throw new HttpsError("failed-precondition", "The selected coordinator account is unavailable.");
    }
    const coordinator = coordinatorSnapshot.data();
    if (!coordinatorName) {
      coordinatorName = `${coordinator.firstName || ""} ${coordinator.lastName || ""}`.trim();
    }
  }

  const auth = getAuth();
  const temporaryPassword = generateTemporaryPassword();
  let createdUser;
  try {
    createdUser = await auth.createUser({
      email,
      password: temporaryPassword,
      displayName: `${firstName} ${lastName}`,
      disabled: false,
      emailVerified: false,
    });
  } catch (error) {
    if (error.code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", "This email address is already registered.");
    }
    if (error.code === "auth/invalid-email") {
      throw new HttpsError("invalid-argument", "Enter a valid student email address.");
    }
    throw error;
  }

  const profile = {
    uid: createdUser.uid,
    email,
    firstName,
    lastName,
    phone: String(data.phone || roster.phone || "").trim(),
    role: "student",
    status: "ACTIVE",
    isActive: true,
    isArchived: false,
    mustChangePassword: true,
    studentId: String(roster.studentId || data.studentId || "").trim(),
    studentRecordId,
    course: String(roster.course || data.course || "").trim(),
    schoolYear: String(roster.schoolYear || data.schoolYear || "").trim(),
    company: String(roster.company || data.company || "").trim(),
    ...(coordinatorUid ? { coordinatorUid } : {}),
    ...(coordinatorName ? { coordinatorName } : {}),
    ...(roster.department ? { department: roster.department } : {}),
    ...(departmentId ? { departmentId } : {}),
    ...(roster.major ? { major: roster.major } : {}),
    accountNotificationStatus: "Pending",
    createdAt: FieldValue.serverTimestamp(),
    createdBy: adminUid,
    updatedAt: FieldValue.serverTimestamp(),
  };

  try {
    await db.runTransaction(async (transaction) => {
      const currentRoster = await transaction.get(rosterRef);
      if (!currentRoster.exists || currentRoster.data().studentUid ||
        currentRoster.data().userUid || currentRoster.data().accountUid) {
        throw new HttpsError("already-exists", "This student record was linked to an account by another request.");
      }
      const userRef = db.collection("users").doc(createdUser.uid);
      const studentAccountRef = db.collection("studentAccounts").doc(createdUser.uid);
      transaction.create(userRef, profile);
      transaction.create(studentAccountRef, profile);
      transaction.update(rosterRef, {
        firstName,
        lastName,
        name: `${firstName} ${lastName}`,
        email,
        accountEmail: email,
        studentUid: createdUser.uid,
        accountNotificationStatus: "Pending",
        ...(coordinatorUid ? { coordinatorUid } : {}),
        ...(coordinatorName ? { coordinatorName } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (error) {
    await auth.deleteUser(createdUser.uid).catch((cleanupError) => {
      logger.error("Unable to remove an unlinked student Auth account", {
        uid: createdUser.uid,
        error: String(cleanupError.message || cleanupError),
      });
    });
    throw error;
  }

  const emailStatus = await deliverNotification(db, createdUser.uid, studentRecordId, {
    email,
    fullName: `${firstName} ${lastName}`,
    password: temporaryPassword,
  });
  return {
    uid: createdUser.uid,
    email,
    role: "student",
    alreadyExists: false,
    emailStatus,
  };
}

async function resendStudentAccountNotificationHandler(request) {
  const { db } = await requireAdministrator(request);
  const studentRecordId = String(request.data?.studentRecordId || "").trim();
  if (!studentRecordId) {
    throw new HttpsError("invalid-argument", "A student record is required.");
  }
  const rosterSnapshot = await db.collection("students").doc(studentRecordId).get();
  if (!rosterSnapshot.exists) {
    throw new HttpsError("not-found", "The student roster record no longer exists.");
  }
  const roster = rosterSnapshot.data();
  const uid = roster.studentUid || roster.userUid || roster.accountUid;
  if (!uid) {
    throw new HttpsError("failed-precondition", "This student does not have a linked login account.");
  }
  const userRef = db.collection("users").doc(uid);
  const userSnapshot = await userRef.get();
  if (!userSnapshot.exists || userSnapshot.data().role !== "student") {
    throw new HttpsError("failed-precondition", "The linked login is not a student account.");
  }
  const profile = userSnapshot.data();
  if (!isAccountLive(profile)) {
    throw new HttpsError("failed-precondition", "This student account is inactive or archived.");
  }
  const email = String(profile.email || roster.accountEmail || roster.email || "").trim().toLowerCase();
  if (!email) {
    throw new HttpsError("failed-precondition", "The student account has no email address.");
  }

  const temporaryPassword = generateTemporaryPassword();
  const pending = {
    mustChangePassword: true,
    accountNotificationStatus: "Pending",
    accountNotificationUpdatedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  const batch = db.batch();
  batch.set(userRef, pending, { merge: true });
  batch.set(db.collection("studentAccounts").doc(uid), pending, { merge: true });
  batch.set(db.collection("students").doc(studentRecordId), pending, { merge: true });
  await batch.commit();
  try {
    await getAuth().updateUser(uid, { password: temporaryPassword });
  } catch (error) {
    logger.error("Unable to set a new temporary password for account notification", {
      uid,
      studentRecordId,
      error: String(error.message || error),
    });
    await writeNotificationStatus(db, uid, studentRecordId, "Failed");
    throw new HttpsError("internal", "The account password could not be reset. Please retry the notification.");
  }

  const emailStatus = await deliverNotification(db, uid, studentRecordId, {
    email,
    fullName: studentName(profile, roster),
    password: temporaryPassword,
  });
  return { uid, email, emailStatus };
}

exports.createStudentAccount = onCall(
  { secrets: notificationSecrets },
  createStudentAccountHandler,
);
exports.resendStudentAccountNotification = onCall(
  { secrets: notificationSecrets },
  resendStudentAccountNotificationHandler,
);
exports.generateTemporaryPassword = generateTemporaryPassword;
exports.buildNotification = buildNotification;
