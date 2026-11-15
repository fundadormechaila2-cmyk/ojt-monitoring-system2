const { getAuth } = require("firebase-admin/auth");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { isAccountLive } = require("./accountState");
const { roleCollectionFor } = require("./roleAccounts");

async function completePasswordChangeHandler(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in before changing your password.");
  const { currentPassword, newPassword, apiKey } = request.data || {};
  if (typeof currentPassword !== "string" || typeof newPassword !== "string" ||
      typeof apiKey !== "string" || !currentPassword || !apiKey ||
      newPassword.length < 8 || newPassword.length > 4096 ||
      !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) ||
      !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword) ||
      currentPassword === newPassword) {
    throw new HttpsError("invalid-argument", "Enter a different password that meets the password requirements.");
  }
  const db = getFirestore();
  const ref = db.collection("users").doc(request.auth.uid);
  const snapshot = await ref.get();
  const profile = snapshot.exists ? snapshot.data() : null;
  if (!isAccountLive(profile) || !profile.mustChangePassword || !profile.email) {
    throw new HttpsError("failed-precondition", "This account does not require a password change.");
  }
  let response;
  try {
    response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: profile.email, password: currentPassword, returnSecureToken: true }),
    });
  } catch {
    throw new HttpsError("unavailable", "Password verification is temporarily unavailable.");
  }
  if (!response.ok) throw new HttpsError("permission-denied", "The current password could not be verified.");
  const result = await response.json();
  let verified;
  try {
    verified = await getAuth().verifyIdToken(result.idToken);
  } catch {
    throw new HttpsError("permission-denied", "The current password could not be verified.");
  }
  if (verified.uid !== request.auth.uid) {
    throw new HttpsError("permission-denied", "The current password could not be verified.");
  }
  try {
    await getAuth().updateUser(request.auth.uid, { password: newPassword });
  } catch (error) {
    logger.error("Password update failed", { uid: request.auth.uid, code: error.code });
    throw new HttpsError("failed-precondition", "The password could not be updated. Check the Firebase password policy and try again.");
  }
  try {
    const batch = db.batch();
    const changes = { mustChangePassword: false, updatedAt: FieldValue.serverTimestamp() };
    batch.update(ref, changes);
    const roleCollection = roleCollectionFor(profile.role);
    if (roleCollection) batch.set(db.collection(roleCollection).doc(request.auth.uid), changes, { merge: true });
    if (profile.role === "supervisor") {
      const supervisorRef = db.collection("supervisors").doc(request.auth.uid);
      const supervisor = await supervisorRef.get();
      if (supervisor.exists && supervisor.data().uid === request.auth.uid &&
          supervisor.data().role === "supervisor") batch.update(supervisorRef, changes);
    }
    if (profile.role === "student" && profile.studentRecordId) {
      const rosterRef = db.collection("students").doc(profile.studentRecordId);
      const roster = await rosterRef.get();
      if (roster.exists && roster.data().studentUid === request.auth.uid &&
          roster.data().mustChangePassword === true) {
        batch.update(rosterRef, changes);
      }
    }
    await batch.commit();
  } catch (error) {
    logger.error("Password changed but account state update failed", { uid: request.auth.uid, code: error.code });
    throw new HttpsError("internal", "Your password was changed, but account activation failed. Sign in with the new password and try again.");
  }
  return { success: true };
}

exports.completePasswordChange = onCall(completePasswordChangeHandler);
exports.completePasswordChangeHandler = completePasswordChangeHandler;
