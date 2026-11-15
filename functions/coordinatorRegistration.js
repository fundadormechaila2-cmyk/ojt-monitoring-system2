const { getAuth } = require("firebase-admin/auth");
const { FieldValue } = require("firebase-admin/firestore");
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { departmentIdFor } = require("./departments");
const { isAccountLive } = require("./accountState");
const { generateTemporaryPassword } = require("./temporaryPassword");
const { notificationSecrets, requireAdministrator, sendAccountNotification } = require("./studentRegistration");

const departmentLabels = {
  BSIT: "Bachelor of Science in Information Technology",
  BSHM: "Bachelor of Science in Hospitality Management",
  BSBA: "Bachelor of Science in Business Administration (BSBA)",
  BSED: "Bachelor of Science in Secondary Education",
  BEED: "Bachelor of Science in Elementary Education",
};

async function setStatus(db, uid, status) {
  const changes = {
    accountNotificationStatus: status,
    accountNotificationUpdatedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  const batch = db.batch();
  batch.update(db.collection("users").doc(uid), changes);
  batch.update(db.collection("coordinatorsAccount").doc(uid), changes);
  await batch.commit();
}

async function deliver(db, uid, credentials) {
  try {
    await sendAccountNotification({ ...credentials, role: "coordinator" });
  } catch (error) {
    logger.error("Coordinator notification delivery failed", { uid, code: error.code });
    try {
      await setStatus(db, uid, "Failed");
    } catch (statusError) {
      logger.error("Unable to record notification failure", { uid, error: String(statusError.message || statusError) });
    }
    return "Failed";
  }
  try {
    await setStatus(db, uid, "Sent");
  } catch (error) {
    logger.error("Unable to record successful notification", { uid, error: String(error.message || error) });
    return "StatusUnknown";
  }
  return "Sent";
}

async function createCoordinatorAccountHandler(request) {
  const { db, adminUid } = await requireAdministrator(request);
  const data = request.data || {};
  const fullName = String(data.fullName || "").trim().replace(/\s+/g, " ");
  const email = String(data.email || "").trim().toLowerCase();
  const departmentId = departmentIdFor(data.department);
  if (!fullName || fullName.length > 120 || email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !departmentId) {
    throw new HttpsError("invalid-argument", "Enter a valid name, email address, and department.");
  }
  const password = generateTemporaryPassword();
  const auth = getAuth();
  let account;
  try {
    account = await auth.createUser({ email, password, displayName: fullName });
  } catch (error) {
    if (error.code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", "This email address is already registered.");
    }
    logger.error("Coordinator Auth creation failed", { code: error.code });
    throw new HttpsError("internal", "The coordinator login could not be created.");
  }
  const [firstName, ...lastName] = fullName.split(" ");
  const profile = {
    uid: account.uid, coordinatorId: `COORD-${account.uid}`, firstName,
    lastName: lastName.join(" "), fullName, email,
    department: departmentLabels[departmentId], departmentId, role: "coordinator",
    status: "ACTIVE", accountStatus: "ACTIVE", isActive: true, isArchived: false,
    mustChangePassword: true, accountNotificationStatus: "Pending",
    createdBy: adminUid, createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  try {
    const batch = db.batch();
    batch.create(db.collection("users").doc(account.uid), profile);
    batch.create(db.collection("coordinatorsAccount").doc(account.uid), profile);
    await batch.commit();
  } catch (error) {
    try {
      await auth.deleteUser(account.uid);
    } catch (cleanupError) {
      logger.error("Unable to remove unlinked coordinator Auth account", { uid: account.uid, code: cleanupError.code });
      throw new HttpsError("internal", "Profile creation failed and the unlinked login could not be removed. Contact an administrator.");
    }
    logger.error("Coordinator profile creation failed", { uid: account.uid, code: error.code });
    throw new HttpsError("internal", "The coordinator profile could not be saved.");
  }
  const emailStatus = await deliver(db, account.uid, { email, fullName, password });
  return { uid: account.uid, email, role: "coordinator", emailStatus };
}

async function resendCoordinatorNotificationHandler(request) {
  const { db } = await requireAdministrator(request);
  const uid = String(request.data?.uid || "").trim();
  if (!uid) throw new HttpsError("invalid-argument", "A coordinator account is required.");
  const snapshot = await db.collection("users").doc(uid).get();
  const profile = snapshot.exists ? snapshot.data() : null;
  if (!profile || profile.role !== "coordinator" || !isAccountLive(profile)) {
    throw new HttpsError("failed-precondition", "The coordinator account is unavailable.");
  }
  const email = String(profile.email || "").trim().toLowerCase();
  if (!email) throw new HttpsError("failed-precondition", "The account has no email address.");
  const password = generateTemporaryPassword();
  const pending = { mustChangePassword: true, accountNotificationStatus: "Pending", updatedAt: FieldValue.serverTimestamp() };
  const batch = db.batch();
  batch.update(db.collection("users").doc(uid), pending);
  batch.update(db.collection("coordinatorsAccount").doc(uid), pending);
  await batch.commit();
  try {
    await getAuth().updateUser(uid, { password });
    await getAuth().revokeRefreshTokens(uid);
  } catch (error) {
    logger.error("Unable to reset coordinator password", { uid, code: error.code });
    await setStatus(db, uid, "Failed");
    throw new HttpsError("internal", "The account password could not be reset. Please retry.");
  }
  const emailStatus = await deliver(db, uid, {
    email, password, fullName: profile.fullName || `${profile.firstName || ""} ${profile.lastName || ""}`.trim(),
  });
  return { uid, email, emailStatus };
}

exports.createCoordinatorAccount = onCall({ secrets: notificationSecrets }, createCoordinatorAccountHandler);
exports.resendCoordinatorAccountNotification = onCall({ secrets: notificationSecrets }, resendCoordinatorNotificationHandler);
exports.createCoordinatorAccountHandler = createCoordinatorAccountHandler;
exports.resendCoordinatorNotificationHandler = resendCoordinatorNotificationHandler;
