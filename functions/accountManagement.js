const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { isAccountLive } = require("./accountState");
const { recordDepartmentId, sameDepartment } = require("./departments");

const ACTIONS = ["preview", "deactivate", "reactivate", "archive", "restore", "delete"];
const TARGET_TYPES = ["user", "student"];

async function count(query) {
  const snapshot = await query.count().get();
  return snapshot.data().count;
}

async function requireActor(db, request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in to manage accounts.");
  }
  const snapshot = await db.collection("users").doc(request.auth.uid).get();
  const profile = snapshot.exists ? snapshot.data() : null;
  if (!profile || !isAccountLive(profile) || !["admin", "coordinator"].includes(profile.role)) {
    throw new HttpsError("permission-denied", "Only active administrators or coordinators can manage accounts.");
  }
  return profile;
}

// Coordinators may only preview or delete supervisors of their own department.
function assertCoordinatorScope(actor, action, target) {
  if (
    !["preview", "delete"].includes(action) ||
    target.user?.role !== "supervisor" ||
    !recordDepartmentId(actor) ||
    !sameDepartment(actor, target.user)
  ) {
    throw new HttpsError(
      "permission-denied",
      "Coordinators can only delete supervisors in their own department.",
    );
  }
}

async function unassignStudents(db, supervisorUid) {
  const students = await db.collection("students").where("supervisorUid", "==", supervisorUid).get();
  for (const student of students.docs) {
    const clear = {
      supervisorUid: FieldValue.delete(),
      supervisorName: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    await student.ref.update(clear);
    const studentUid = student.data().studentUid;
    if (studentUid) {
      await db.collection("users").doc(studentUid).update(clear).catch(() => {});
    }
  }
  return students.size;
}

async function findRosterRefs(db, uid, user) {
  const refs = new Map();
  const add = (snapshot) => {
    if (snapshot.exists) refs.set(snapshot.ref.path, snapshot.ref);
  };
  if (user?.studentRecordId) add(await db.collection("students").doc(String(user.studentRecordId)).get());
  if (uid) {
    const linked = await db.collection("students").where("studentUid", "==", uid).limit(10).get();
    linked.docs.forEach(add);
    add(await db.collection("students").doc(uid).get());
  }
  return [...refs.values()];
}

async function resolveTarget(db, data) {
  const { targetType, targetId } = data ?? {};
  if (
    !TARGET_TYPES.includes(targetType) ||
    typeof targetId !== "string" ||
    !targetId ||
    targetId.length > 128 ||
    targetId.includes("/")
  ) {
    throw new HttpsError("invalid-argument", "A valid account or student record is required.");
  }

  if (targetType === "user") {
    const snapshot = await db.collection("users").doc(targetId).get();
    const user = snapshot.exists ? snapshot.data() : null;
    return {
      uid: targetId,
      userRef: snapshot.ref,
      user,
      rosterRefs: user?.role === "student" ? await findRosterRefs(db, targetId, user) : [],
    };
  }

  const rosterSnapshot = await db.collection("students").doc(targetId).get();
  if (!rosterSnapshot.exists) {
    throw new HttpsError("not-found", "The student record no longer exists.");
  }
  const roster = rosterSnapshot.data();
  const uid = roster.studentUid || null;
  const userSnapshot = uid ? await db.collection("users").doc(uid).get() : null;
  return {
    uid,
    userRef: userSnapshot?.exists ? userSnapshot.ref : null,
    user: userSnapshot?.exists ? userSnapshot.data() : null,
    roster,
    rosterRefs: [rosterSnapshot.ref],
  };
}

function targetName(target) {
  const user = target.user;
  const source = user || target.roster || {};
  const name = source.name || source.fullName ||
    `${source.firstName || ""} ${source.lastName || ""}`.trim();
  return name || source.email || target.uid || "Unnamed account";
}

async function relatedSummary(db, target) {
  const role = target.user?.role || "student";
  const uid = target.uid;
  const counts = {};
  const blockers = [];

  if (role === "student") {
    if (uid) {
      const [attendance, evaluations, applications, loginActivity] = await Promise.all([
        count(db.collection("attendance").where("studentUid", "==", uid)),
        count(db.collection("evaluations").where("studentUid", "==", uid)),
        count(db.collection("applications").where("studentUid", "==", uid)),
        count(db.collection("studentLoginActivity").where("userId", "==", uid)),
      ]);
      Object.assign(counts, { attendance, evaluations, applications, loginActivity });
    }
    counts.studentRecords = target.rosterRefs.length;
  } else if (role === "supervisor") {
    counts.assignedStudents = await count(db.collection("students").where("supervisorUid", "==", uid));
    counts.attendance = await count(db.collection("attendance").where("supervisorId", "==", uid));
    if (counts.assignedStudents > 0) {
      blockers.push("This supervisor still has assigned students. Reassign them first, or archive the account instead.");
    }
  } else if (role === "coordinator") {
    counts.assignedStudents = await count(db.collection("students").where("coordinatorUid", "==", uid));
    counts.createdSupervisors = await count(db.collection("users").where("createdBy", "==", uid));
    if (counts.assignedStudents > 0) {
      blockers.push("This coordinator still has assigned students. Reassign them first, or archive the account instead.");
    }
  }

  const preserved = (counts.attendance || 0) + (counts.evaluations || 0) + (counts.applications || 0);
  return { role, counts, blockers, hasAcademicRecords: preserved > 0 };
}

async function assertNotLastAdmin(db, uid) {
  const admins = await db.collection("users").where("role", "==", "admin").get();
  const otherActive = admins.docs.filter((doc) => doc.id !== uid && isAccountLive(doc.data()));
  if (otherActive.length === 0) {
    throw new HttpsError("failed-precondition", "At least one active administrator must remain.");
  }
}

async function setAuthDisabled(uid, disabled, warnings) {
  if (!uid) return;
  try {
    await getAuth().updateUser(uid, { disabled });
    if (disabled) await getAuth().revokeRefreshTokens(uid);
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      warnings.push("No Firebase Authentication account was found for this user.");
      return;
    }
    throw error;
  }
}

function stateFields(kind, adminUid) {
  const now = FieldValue.serverTimestamp();
  switch (kind) {
    case "deactivate":
      return { isActive: false, status: "INACTIVE", deactivatedAt: now, deactivatedBy: adminUid, updatedAt: now };
    case "archive":
      return {
        isActive: false, isArchived: true, status: "ARCHIVED",
        deletedAt: now, deletedBy: adminUid, updatedAt: now,
      };
    case "reactivate":
      return {
        isActive: true, status: "ACTIVE", deactivatedAt: null, deactivatedBy: null,
        reactivatedAt: now, reactivatedBy: adminUid, updatedAt: now,
      };
    default:
      return {
        isActive: true, isArchived: false, status: "ACTIVE", deletedAt: null, deletedBy: null,
        deactivatedAt: null, deactivatedBy: null, restoredAt: now, restoredBy: adminUid, updatedAt: now,
      };
  }
}

// Roster documents keep their OJT `status`; only lifecycle flags are changed there.
function rosterFields(kind, adminUid) {
  const { status, ...fields } = stateFields(kind, adminUid);
  void status;
  return fields;
}

async function applyLifecycle(db, target, kind, adminUid, warnings, extraUserFields = {}) {
  const batch = db.batch();
  if (target.userRef && target.user) {
    batch.update(target.userRef, { ...stateFields(kind, adminUid), ...extraUserFields });
  }
  target.rosterRefs.forEach((ref) => batch.update(ref, rosterFields(kind, adminUid)));

  const disabling = kind === "deactivate" || kind === "archive";
  if (disabling) {
    // Lock Firestore access first so a failed Auth call can never leave the account usable.
    await batch.commit();
    await setAuthDisabled(target.uid, true, warnings);
  } else {
    // Re-enable Auth first; the profile flags keep the account locked if the batch fails.
    await setAuthDisabled(target.uid, false, warnings);
    await batch.commit();
  }
}

async function writeAudit(db, entry) {
  const ref = db.collection("auditLogs").doc();
  await ref.set({ ...entry, createdAt: FieldValue.serverTimestamp() });
  return ref;
}

const messages = {
  deactivate: "Account deactivated.",
  reactivate: "Account reactivated.",
  archive: "Record archived.",
  restore: "Record restored.",
  delete: "Account permanently deleted.",
};

async function handleManageAccount(request) {
  const db = getFirestore();
  const adminProfile = await requireActor(db, request);
  const adminUid = request.auth.uid;
  const action = request.data?.action;
  if (!ACTIONS.includes(action)) {
    throw new HttpsError("invalid-argument", "Unsupported account action.");
  }

  const target = await resolveTarget(db, request.data);
  if (!target.user && !target.roster) {
    throw new HttpsError("not-found", "The account no longer exists.");
  }
  const isCoordinatorActor = adminProfile.role === "coordinator";
  if (isCoordinatorActor) assertCoordinatorScope(adminProfile, action, target);
  const role = target.user?.role || "student";
  const related = await relatedSummary(db, target);
  const base = {
    target: { uid: target.uid, name: targetName(target), email: target.user?.email || target.roster?.email || "", role },
    related,
    isSelf: target.uid === adminUid,
  };
  if (action === "preview") return { ok: true, ...base };

  if (target.uid === adminUid) {
    throw new HttpsError("failed-precondition", "You cannot deactivate, archive, or delete your own account.");
  }
  if (role === "admin" && ["deactivate", "archive", "delete"].includes(action)) {
    await assertNotLastAdmin(db, target.uid);
  }
  if (!target.user && ["deactivate", "reactivate"].includes(action)) {
    throw new HttpsError("failed-precondition", "This student record has no user account to change.");
  }

  const warnings = [];
  const auditBase = {
    action,
    performedBy: adminUid,
    performedByEmail: adminProfile.email || "",
    targetUid: target.uid,
    targetRole: role,
    targetName: base.target.name,
    targetEmail: base.target.email,
    relatedCounts: related.counts,
  };

  try {
    const archived = target.user ? target.user.isArchived === true : target.roster?.isArchived === true;
    if (action === "deactivate" || action === "reactivate") {
      if (archived) {
        throw new HttpsError("failed-precondition", "This record is archived. Restore it first.");
      }
      await applyLifecycle(db, target, action, adminUid, warnings);
    } else if (action === "archive") {
      await applyLifecycle(db, target, "archive", adminUid, warnings);
    } else if (action === "restore") {
      if (!archived) throw new HttpsError("failed-precondition", "This record is not archived.");
      await applyLifecycle(db, target, "restore", adminUid, warnings);
    } else {
      if (request.data?.confirm !== true) {
        throw new HttpsError("failed-precondition", "Permanent deletion must be confirmed.");
      }
      if (related.blockers.length && !isCoordinatorActor) {
        throw new HttpsError("failed-precondition", related.blockers[0]);
      }
      if (isCoordinatorActor) {
        await unassignStudents(db, target.uid);
      }

      if (!target.user) {
        if (related.hasAcademicRecords) {
          throw new HttpsError("failed-precondition", "This student record has academic history and can only be archived.");
        }
        await Promise.all(target.rosterRefs.map((ref) => ref.delete()));
        await writeAudit(db, { ...auditBase, outcome: "completed" });
        return { ok: true, action, message: messages.delete, warnings, ...base };
      }

      const auditRef = await writeAudit(db, { ...auditBase, outcome: "started" });
      // Step 1: lock the account and preserve student history on the archived roster record.
      await applyLifecycle(db, target, "archive", adminUid, warnings, { deletionPending: true });
      if (target.rosterRefs.length) {
        const batch = db.batch();
        target.rosterRefs.forEach((ref) => batch.update(ref, {
          accountDeleted: true,
          deletedAccountSnapshot: { name: base.target.name, email: base.target.email, role },
        }));
        await batch.commit();
      }
      // Step 2: remove the Authentication account (already-missing is fine), then the profile.
      try {
        await getAuth().deleteUser(target.uid);
      } catch (error) {
        if (error.code !== "auth/user-not-found") {
          await auditRef.update({ outcome: "auth_delete_failed", error: String(error.message || error) });
          throw error;
        }
      }
      try {
        await target.userRef.delete();
      } catch (error) {
        await auditRef.update({ outcome: "profile_delete_failed", error: String(error.message || error) });
        throw error;
      }
      await auditRef.update({ outcome: "completed" });
      return { ok: true, action, message: messages.delete, warnings, ...base };
    }

    await writeAudit(db, { ...auditBase, outcome: "completed" });
    return { ok: true, action, message: messages[action], warnings, ...base };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.error("manageAccount failed", { action, targetUid: target.uid, error: String(error) });
    throw new HttpsError(
      "internal",
      "The operation did not finish. The account has been locked where possible; please retry.",
    );
  }
}

exports.handleManageAccount = handleManageAccount;
exports.manageAccount = onCall(handleManageAccount);
