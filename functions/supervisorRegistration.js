const { getAuth } = require("firebase-admin/auth");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { isAccountLive } = require("./accountState");
const { recordDepartmentId } = require("./departments");
const { generateTemporaryPassword } = require("./temporaryPassword");
const { notificationSecrets, sendAccountNotification } = require("./studentRegistration");

async function coordinatorFor(request, db) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in as a coordinator.");
  const snapshot = await db.collection("users").doc(request.auth.uid).get();
  const profile = snapshot.exists ? snapshot.data() : null;
  if (!isAccountLive(profile) || profile.role !== "coordinator" ||
      profile.mustChangePassword || !recordDepartmentId(profile) || !profile.department) {
    throw new HttpsError("permission-denied", "Only active coordinators with a department can create supervisor accounts.");
  }
  return profile;
}

async function notificationStatus(db, uid, status) {
  const batch = db.batch();
  const changes = {
    accountNotificationStatus: status,
    accountNotificationUpdatedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  for (const collection of ["users", "supervisorsAccount", "supervisors"]) {
    batch.update(db.collection(collection).doc(uid), changes);
  }
  await batch.commit();
}

async function deliver(db, uid, credentials) {
  try {
    await sendAccountNotification({ ...credentials, role: "supervisor" });
  } catch (error) {
    logger.error("Supervisor notification delivery failed", { uid, code: error.code });
    try {
      await notificationStatus(db, uid, "Failed");
    } catch (statusError) {
      logger.error("Could not save supervisor notification failure", { uid, code: statusError.code });
    }
    return "Failed";
  }
  try {
    await notificationStatus(db, uid, "Sent");
  } catch (error) {
    logger.error("Could not save supervisor notification status", { uid, code: error.code });
    return "StatusUnknown";
  }
  return "Sent";
}

async function createSupervisorAccountHandler(request) {
  const db = getFirestore();
  const coordinator = await coordinatorFor(request, db);
  const data = request.data || {};
  const firstName = String(data.firstName || "").trim();
  const lastName = String(data.lastName || "").trim();
  const email = String(data.email || "").trim().toLowerCase();
  const company = String(data.company || "").trim();
  const schoolYear = String(data.schoolYear || "").trim();
  const partnerCompanyId = String(data.partnerCompanyId || "").trim();
  const ids = Array.isArray(data.assignedStudentRecordIds)
    ? [...new Set(data.assignedStudentRecordIds)] : [];
  if (!firstName || !lastName || firstName.length > 120 || lastName.length > 120 ||
      !/^[^\s@]+@gmail\.com$/.test(email) || email.length > 254 ||
      !company || !schoolYear || !ids.length || ids.length > 165 ||
      ids.some((id) => typeof id !== "string" || !id || id.includes("/")) ||
      partnerCompanyId.includes("/")) {
    throw new HttpsError("invalid-argument", "Enter a valid name, Gmail address, company, school year, and assigned students.");
  }

  const auth = getAuth();
  const password = generateTemporaryPassword();
  let account;
  try {
    account = await auth.createUser({ email, password, displayName: `${firstName} ${lastName}` });
  } catch (error) {
    if (error.code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", "This email address is already registered.");
    }
    logger.error("Supervisor Auth creation failed", { code: error.code });
    throw new HttpsError("internal", "The supervisor login could not be created.");
  }
  const profile = {
    uid: account.uid, email, firstName, lastName, role: "supervisor",
    phone: String(data.phone || "").trim(), position: String(data.position || "").trim(),
    department: coordinator.department, departmentId: recordDepartmentId(coordinator),
    coordinatorUid: request.auth.uid, createdBy: request.auth.uid,
    company, partnerCompanyId: partnerCompanyId || null, schoolYear,
    assignedStudentRecordId: ids[0],
    status: "ACTIVE", isActive: true, isArchived: false,
    mustChangePassword: true, accountNotificationStatus: "Pending",
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  };
  try {
    await db.runTransaction(async (transaction) => {
      const actorRef = db.collection("users").doc(request.auth.uid);
      const currentCoordinator = await transaction.get(actorRef);
      const actor = currentCoordinator.exists ? currentCoordinator.data() : null;
      if (!isAccountLive(actor) || actor.role !== "coordinator" || actor.mustChangePassword ||
          actor.department !== coordinator.department || recordDepartmentId(actor) !== profile.departmentId) {
        throw new HttpsError("permission-denied", "Your coordinator account or department changed. Please retry.");
      }
      if (partnerCompanyId) {
        const companySnapshot = await transaction.get(db.collection("partnerCompanies").doc(partnerCompanyId));
        if (!companySnapshot.exists) throw new HttpsError("failed-precondition", "The selected partner company no longer exists.");
        const partner = companySnapshot.data();
        const partnerName = partner.companyName || partner.name || partner.businessName ||
          partner.company || partner.email || partnerCompanyId;
        if (String(partnerName).trim().toLowerCase() !== company.toLowerCase()) {
          throw new HttpsError("failed-precondition", "The selected partner company has changed. Please select it again.");
        }
      }
      const studentRefs = ids.map((id) => db.collection("students").doc(id));
      const students = await Promise.all(studentRefs.map((ref) => transaction.get(ref)));
      const linked = [];
      for (const student of students) {
        const roster = student.exists ? student.data() : null;
        if (!roster || roster.coordinatorUid !== request.auth.uid ||
            recordDepartmentId(roster) !== profile.departmentId ||
            roster.supervisorUid || roster.isArchived === true ||
            (roster.schoolYear && roster.schoolYear !== schoolYear)) {
          throw new HttpsError("failed-precondition", "A selected student is unavailable, already assigned, or outside your department or school year.");
        }
        if (roster.studentUid) {
          const userRef = db.collection("users").doc(roster.studentUid);
          const roleRef = db.collection("studentsAccount").doc(roster.studentUid);
          const [userSnapshot, roleSnapshot] = await Promise.all([
            transaction.get(userRef), transaction.get(roleRef),
          ]);
          if (!userSnapshot.exists || userSnapshot.data().role !== "student" ||
              userSnapshot.data().coordinatorUid !== request.auth.uid ||
              userSnapshot.data().studentRecordId !== student.id) {
            throw new HttpsError("failed-precondition", "A selected student has an inconsistent account link. Ask an administrator to review it.");
          }
          linked.push({ userRef, roleRef, hasRole: roleSnapshot.exists });
        }
      }
      for (const collection of ["users", "supervisorsAccount", "supervisors"]) {
        transaction.create(db.collection(collection).doc(account.uid), profile);
      }
      const assignment = {
        supervisorUid: account.uid, supervisorName: `${firstName} ${lastName}`,
        supervisorSchoolYear: schoolYear, updatedAt: FieldValue.serverTimestamp(),
      };
      studentRefs.forEach((ref) => transaction.update(ref, {
        ...assignment, partnerCompanyId: partnerCompanyId || null, company,
      }));
      linked.forEach(({ userRef, roleRef, hasRole }) => {
        transaction.update(userRef, assignment);
        if (hasRole) transaction.update(roleRef, assignment);
      });
    });
  } catch (error) {
    try {
      await auth.deleteUser(account.uid);
    } catch (cleanupError) {
      logger.error("Could not remove unlinked supervisor Auth account", { uid: account.uid, code: cleanupError.code });
      throw new HttpsError("internal", "The supervisor profile was not saved and the login could not be removed. Contact an administrator.");
    }
    if (error instanceof HttpsError) throw error;
    logger.error("Supervisor profile creation failed", { uid: account.uid, code: error.code });
    throw new HttpsError("internal", "The supervisor profile could not be saved.");
  }
  const emailStatus = await deliver(db, account.uid, {
    email, password, fullName: `${firstName} ${lastName}`,
  });
  return { uid: account.uid, email, emailStatus };
}

async function resendSupervisorNotificationHandler(request) {
  const db = getFirestore();
  await coordinatorFor(request, db);
  const uid = String(request.data?.uid || "").trim();
  if (!uid || uid.includes("/")) throw new HttpsError("invalid-argument", "Select a supervisor account.");
  const ref = db.collection("users").doc(uid);
  let profile;
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    profile = snapshot.exists ? snapshot.data() : null;
    if (!isAccountLive(profile) || profile.role !== "supervisor" ||
        profile.createdBy !== request.auth.uid || !profile.mustChangePassword ||
        profile.accountNotificationStatus !== "Failed" || !profile.email) {
      throw new HttpsError("failed-precondition", "This supervisor is not eligible for an email retry.");
    }
    transaction.update(ref, { accountNotificationStatus: "Pending", updatedAt: FieldValue.serverTimestamp() });
  });
  const password = generateTemporaryPassword();
  try {
    await getAuth().updateUser(uid, { password });
    await getAuth().revokeRefreshTokens(uid);
  } catch (error) {
    logger.error("Supervisor password reset failed", { uid, code: error.code });
    try {
      await notificationStatus(db, uid, "Failed");
    } catch (statusError) {
      logger.error("Could not save supervisor retry failure", { uid, code: statusError.code });
    }
    throw new HttpsError("internal", "The supervisor password could not be reset. Contact an administrator if retry is unavailable.");
  }
  const emailStatus = await deliver(db, uid, {
    email: profile.email, password, fullName: `${profile.firstName || ""} ${profile.lastName || ""}`.trim(),
  });
  return { uid, email: profile.email, emailStatus };
}

exports.createSupervisorAccount = onCall({ secrets: notificationSecrets }, createSupervisorAccountHandler);
exports.resendSupervisorAccountNotification = onCall({ secrets: notificationSecrets }, resendSupervisorNotificationHandler);
exports.createSupervisorAccountHandler = createSupervisorAccountHandler;
exports.resendSupervisorNotificationHandler = resendSupervisorNotificationHandler;
