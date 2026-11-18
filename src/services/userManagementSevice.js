import {
  createUserWithEmailAndPassword,
  deleteUser,
  sendPasswordResetEmail,
  updateProfile,
  signOut,
} from "firebase/auth";
import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

import { secondaryAuth } from "./secondatyAuth";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions, firebaseConfig } from "./firebase";
import { syncStudentAccount } from "./studentAccountService";
import { roleAccountRef, toRoleProfile } from "./accountCollections";
import { departmentFields, recordDepartmentId, studentDepartmentFields } from "../constants/departments";
import { accountFunctionError } from "./accountFunctionError";
import { isAccountLive } from "./recordState";

async function callAccountFunction(name, data) {
  try {
    const result = await httpsCallable(functions, name)(data);
    return result.data;
  } catch (error) {
    throw accountFunctionError(error);
  }
}

// GENERATE TEMPORARY PASSWORD
export const generateTemporaryPassword = (length = 12) => {
  const characters =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";

  let password = "";

  const randomValues = crypto.getRandomValues(new Uint32Array(length));

  for (let i = 0; i < length; i++) {
    password += characters[randomValues[i] % characters.length];
  }

  return password;
};

async function requireAdminSession(createdBy) {
  const admin = auth.currentUser;
  if (!admin || admin.uid !== createdBy) {
    throw new Error("Sign in as an administrator to manage accounts.");
  }
  const snapshot = await getDoc(doc(db, "users", admin.uid));
  if (!snapshot.exists() || snapshot.data().role !== "admin" ||
      !isAccountLive(snapshot.data()) || snapshot.data().mustChangePassword) {
    throw new Error("Only active administrators can manage these accounts.");
  }
}

async function writeSetupStatus(uid, role, studentRecordId, status) {
  const changes = {
    accountNotificationStatus: status,
    accountNotificationUpdatedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const batch = writeBatch(db);
  batch.update(doc(db, "users", uid), changes);
  batch.set(roleAccountRef(role, uid), changes, { merge: true });
  if (role === "supervisor") batch.update(doc(db, "supervisors", uid), changes);
  if (studentRecordId) batch.update(doc(db, "students", studentRecordId), changes);
  await batch.commit();
}

async function sendSetupNotification(uid, role, studentRecordId, email) {
  try {
    await sendPasswordResetEmail(secondaryAuth, email);
  } catch (error) {
    console.error("Unable to send password setup email:", error);
    try {
      await writeSetupStatus(uid, role, studentRecordId, "Failed");
    } catch (statusError) {
      console.error("Unable to record the failed setup email status:", statusError);
    }
    return "Failed";
  }
  try {
    await writeSetupStatus(uid, role, studentRecordId, "Sent");
  } catch (error) {
    console.error("Password setup email was requested, but status could not be saved:", error);
    return "StatusUnknown";
  }
  return "Sent";
}

async function requireCoordinatorSession() {
  const coordinator = auth.currentUser;
  if (!coordinator) throw new Error("Sign in as a coordinator to manage supervisors.");
  const snapshot = await getDoc(doc(db, "users", coordinator.uid));
  const profile = snapshot.exists() ? snapshot.data() : null;
  if (!isAccountLive(profile) || profile.role !== "coordinator" ||
      profile.mustChangePassword || !profile.department || !recordDepartmentId(profile)) {
    throw new Error("An active coordinator account with a department is required.");
  }
  return { uid: coordinator.uid, profile };
}

export async function createSupervisorAccount(data) {
  const coordinator = await requireCoordinatorSession();
  const firstName = String(data.firstName || "").trim();
  const lastName = String(data.lastName || "").trim();
  const email = String(data.email || "").trim().toLowerCase();
  const company = String(data.company || "").trim();
  const schoolYear = String(data.schoolYear || "").trim();
  const partnerCompanyId = String(data.partnerCompanyId || "").trim();
  const ids = Array.isArray(data.assignedStudentRecordIds)
    ? [...new Set(data.assignedStudentRecordIds)] : [];
  if (!firstName || !lastName || firstName.length > 120 || lastName.length > 120 ||
      !/^[^\s@]+@gmail\.com$/.test(email) || email.length > 254 || !company ||
      !schoolYear || !ids.length || ids.length > 165 ||
      ids.some((id) => typeof id !== "string" || !id || id.includes("/")) ||
      partnerCompanyId.includes("/")) {
    throw new Error("Enter a valid name, Gmail address, company, school year, and assigned students.");
  }

  let firebaseUser;
  let profileSaved = false;
  try {
    const credential = await createUserWithEmailAndPassword(
      secondaryAuth, email, `Aa1!${generateTemporaryPassword(32)}`,
    );
    firebaseUser = credential.user;
    await updateProfile(firebaseUser, { displayName: `${firstName} ${lastName}` });
    const supervisorName = `${firstName} ${lastName}`;
    const profile = {
      uid: firebaseUser.uid, email, firstName, lastName, role: "supervisor",
      phone: String(data.phone || "").trim(), position: String(data.position || "").trim(),
      department: coordinator.profile.department, departmentId: recordDepartmentId(coordinator.profile),
      coordinatorUid: coordinator.uid, createdBy: coordinator.uid,
      company, partnerCompanyId: partnerCompanyId || null, schoolYear,
      assignedStudentRecordId: ids[0],
      status: "ACTIVE", isActive: true, isArchived: false,
      mustChangePassword: false, accountNotificationStatus: "Pending",
      accountNotificationUpdatedAt: serverTimestamp(),
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    };
    await runTransaction(db, async (transaction) => {
      const currentCoordinator = await transaction.get(doc(db, "users", coordinator.uid));
      const actor = currentCoordinator.exists() ? currentCoordinator.data() : null;
      if (!isAccountLive(actor) || actor.role !== "coordinator" || actor.mustChangePassword ||
          actor.department !== profile.department || recordDepartmentId(actor) !== profile.departmentId) {
        throw new Error("Your coordinator account or department changed. Please retry.");
      }
      if (partnerCompanyId) {
        const partner = await transaction.get(doc(db, "partnerCompanies", partnerCompanyId));
        if (!partner.exists()) throw new Error("The selected partner company no longer exists.");
        const item = partner.data();
        const name = item.companyName || item.name || item.businessName || item.company || item.email || partnerCompanyId;
        if (String(name).trim().toLowerCase() !== company.toLowerCase()) {
          throw new Error("The selected partner company has changed. Please select it again.");
        }
      }
      const refs = ids.map((id) => doc(db, "students", id));
      const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
      const linked = [];
      for (const snapshot of snapshots) {
        const student = snapshot.exists() ? snapshot.data() : null;
        if (!student || student.coordinatorUid !== coordinator.uid ||
            recordDepartmentId(student) !== profile.departmentId || student.supervisorUid ||
            student.isArchived === true || (student.schoolYear && student.schoolYear !== schoolYear)) {
          throw new Error("A selected student is unavailable, already assigned, or outside your department or school year.");
        }
        if (student.studentUid) {
          const userRef = doc(db, "users", student.studentUid);
          const roleRef = doc(db, "studentsAccount", student.studentUid);
          const [userSnapshot, roleSnapshot] = await Promise.all([transaction.get(userRef), transaction.get(roleRef)]);
          if (!userSnapshot.exists() || userSnapshot.data().role !== "student" ||
              userSnapshot.data().coordinatorUid !== coordinator.uid ||
              userSnapshot.data().studentRecordId !== snapshot.id) {
            throw new Error("A selected student has an inconsistent account link. Ask an administrator to review it.");
          }
          linked.push({ userRef, roleRef, hasRole: roleSnapshot.exists() });
        }
      }
      for (const collectionName of ["users", "supervisorsAccount", "supervisors"]) {
        transaction.set(doc(db, collectionName, firebaseUser.uid), profile);
      }
      const assignment = {
        supervisorUid: firebaseUser.uid, supervisorName, supervisorSchoolYear: schoolYear,
        updatedAt: serverTimestamp(),
      };
      refs.forEach((ref) => transaction.update(ref, { ...assignment, partnerCompanyId: partnerCompanyId || null, company }));
      linked.forEach(({ userRef, roleRef, hasRole }) => {
        transaction.update(userRef, assignment);
        if (hasRole) transaction.update(roleRef, assignment);
      });
    });
    profileSaved = true;
    const emailStatus = await sendSetupNotification(firebaseUser.uid, "supervisor", null, email);
    return { uid: firebaseUser.uid, email, emailStatus };
  } catch (error) {
    if (firebaseUser && !profileSaved) {
      try {
        await deleteUser(firebaseUser);
      } catch (cleanupError) {
        console.error("Unable to remove the unlinked supervisor account:", cleanupError);
        throw new Error("Account creation failed and the unlinked login could not be removed. Contact an administrator.", { cause: cleanupError });
      }
    }
    if (error.code === "auth/email-already-in-use") {
      throw new Error("This email address is already registered.", { cause: error });
    }
    throw error;
  } finally {
    try {
      await signOut(secondaryAuth);
    } catch (error) {
      console.error("Unable to sign out the secondary account session:", error);
    }
  }
}

export async function resendSupervisorAccountNotification(uid) {
  const coordinator = await requireCoordinatorSession();
  if (!uid || uid.includes("/")) throw new Error("Select a supervisor account.");
  const snapshot = await getDoc(doc(db, "users", uid));
  const profile = snapshot.exists() ? snapshot.data() : null;
  if (!isAccountLive(profile) || profile.role !== "supervisor" ||
      profile.createdBy !== coordinator.uid || !profile.email) {
    throw new Error("This supervisor account is unavailable for email retry.");
  }
  if (profile.mustChangePassword) {
    throw new Error("This account uses the earlier temporary-password flow. Contact an administrator.");
  }
  await writeSetupStatus(uid, "supervisor", null, "Pending");
  return { uid, email: profile.email, emailStatus: await sendSetupNotification(uid, "supervisor", null, profile.email) };
}

async function createSetupAccount(data, role) {
  await requireAdminSession(data.createdBy);
  const firstName = String(data.firstName || "").trim();
  const lastName = String(data.lastName || "").trim();
  const email = String(data.email || "").trim().toLowerCase();
  if (!firstName || (role === "student" && !lastName) ||
      !email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid name and email address.");
  }
  const coordinatorDepartment = role === "coordinator" ? departmentFields(data.department) : {};
  if (role === "coordinator" && !coordinatorDepartment.departmentId) {
    throw new Error("Select a valid coordinator department.");
  }

  let firebaseUser;
  let profileSaved = false;
  try {
    const credential = await createUserWithEmailAndPassword(
      secondaryAuth, email, `Aa1!${generateTemporaryPassword(32)}`,
    );
    firebaseUser = credential.user;
    await updateProfile(firebaseUser, { displayName: `${firstName} ${lastName}`.trim() });
    const profile = {
      uid: firebaseUser.uid, email, firstName, lastName, role,
      status: "ACTIVE", isActive: true, isArchived: false,
      mustChangePassword: false, accountNotificationStatus: "Pending",
      accountNotificationUpdatedAt: serverTimestamp(),
      createdAt: serverTimestamp(), createdBy: data.createdBy, updatedAt: serverTimestamp(),
      ...(role === "coordinator" ? {
        coordinatorId: `COORD-${firebaseUser.uid}`,
        fullName: `${firstName} ${lastName}`.trim(),
        accountStatus: "ACTIVE",
        ...coordinatorDepartment,
      } : {
        phone: String(data.phone || "").trim(),
        ...(data.studentId ? { studentId: data.studentId } : {}),
        ...(data.studentRecordId ? { studentRecordId: data.studentRecordId } : {}),
        ...(data.course ? { course: data.course, ...studentDepartmentFields(data.course) } : {}),
        ...(data.schoolYear ? { schoolYear: data.schoolYear } : {}),
        ...(data.company ? { company: data.company } : {}),
        ...(data.coordinatorUid ? { coordinatorUid: data.coordinatorUid } : {}),
        ...(data.coordinatorName ? { coordinatorName: data.coordinatorName } : {}),
      }),
    };
    const userRef = doc(db, "users", firebaseUser.uid);
    const roleRef = roleAccountRef(role, firebaseUser.uid);
    if (role === "student" && data.studentRecordId) {
      const rosterRef = doc(db, "students", data.studentRecordId);
      await runTransaction(db, async (transaction) => {
        const roster = await transaction.get(rosterRef);
        if (!roster.exists()) throw new Error("The student roster record no longer exists.");
        if (roster.data().studentUid || roster.data().userUid || roster.data().accountUid) {
          throw new Error("This student already has a linked login account.");
        }
        transaction.set(userRef, profile);
        transaction.set(roleRef, toRoleProfile(profile, firebaseUser.uid));
        transaction.update(rosterRef, {
          firstName, lastName, name: `${firstName} ${lastName}`, email, accountEmail: email,
          studentUid: firebaseUser.uid, accountNotificationStatus: "Pending",
          accountNotificationUpdatedAt: serverTimestamp(),
          ...(data.coordinatorUid ? { coordinatorUid: data.coordinatorUid } : {}),
          ...(data.coordinatorName ? { coordinatorName: data.coordinatorName } : {}),
          updatedAt: serverTimestamp(),
        });
      });
    } else {
      const batch = writeBatch(db);
      batch.set(userRef, profile);
      batch.set(roleRef, toRoleProfile(profile, firebaseUser.uid));
      await batch.commit();
    }
    profileSaved = true;
    const emailStatus = await sendSetupNotification(firebaseUser.uid, role, data.studentRecordId, email);
    return { uid: firebaseUser.uid, email, role, emailStatus };
  } catch (error) {
    if (firebaseUser && !profileSaved) {
      try {
        await deleteUser(firebaseUser);
      } catch (cleanupError) {
        console.error("Unable to remove the unlinked Firebase account:", cleanupError);
        throw new Error("Account creation failed and the unlinked login could not be removed. Contact an administrator.", { cause: cleanupError });
      }
    }
    if (error.code === "auth/email-already-in-use") {
      throw new Error("This email address is already registered.", { cause: error });
    }
    throw error;
  } finally {
    try {
      await signOut(secondaryAuth);
    } catch (error) {
      console.error("Unable to sign out the secondary account session:", error);
    }
  }
}

export async function createCoordinatorLoginAccount(data) {
  const fullName = String(data.fullName || "").trim().replace(/\s+/g, " ");
  if (!fullName || fullName.length > 120) throw new Error("Enter a full name of 1 to 120 characters.");
  const [firstName, ...lastName] = fullName.split(" ");
  return createSetupAccount({ ...data, firstName, lastName: lastName.join(" ") }, "coordinator");
}

async function resendSetupEmail(uid, role, studentRecordId) {
  await requireAdminSession(auth.currentUser?.uid);
  const snapshot = await getDoc(doc(db, "users", uid));
  const profile = snapshot.exists() ? snapshot.data() : null;
  if (!profile || profile.role !== role || !isAccountLive(profile)) {
    throw new Error("This account is unavailable or inactive.");
  }
  if (profile.mustChangePassword) {
    throw new Error("This account uses the earlier temporary-password flow and requires the password-change Cloud Function. Contact an administrator.");
  }
  const email = String(profile.email || "").trim().toLowerCase();
  if (!email) throw new Error("This account has no email address.");
  await writeSetupStatus(uid, role, studentRecordId, "Pending");
  const emailStatus = await sendSetupNotification(uid, role, studentRecordId, email);
  return { uid, email, emailStatus };
}

export async function resendCoordinatorSetupEmail(uid) {
  if (!uid) throw new Error("A coordinator account is required.");
  return resendSetupEmail(uid, "coordinator");
}

// CREATE MANAGED USER
export const createManagedUser = async ({
  firstName,
  lastName,
  email,
  phone,
  role,
  createdBy,
  studentId,
  studentRecordId,
  course,
  schoolYear,
  company,
  coordinatorId,
  coordinatorUid,
  coordinatorName,
  department,
  assignedStudentRecordId,
  assignedStudentRecordIds,
  partnerCompanyId,
  position,
}) => {
  const assignedIds = [
    ...new Set(
      (assignedStudentRecordIds?.length
        ? assignedStudentRecordIds
        : assignedStudentRecordId
          ? [assignedStudentRecordId]
          : []
      ).filter(Boolean),
    ),
  ];
  // VALIDATION
  if (!firstName?.trim()) {
    throw new Error("First name is required.");
  }

  if (!lastName?.trim()) {
    throw new Error("Last name is required.");
  }

  if (!email?.trim()) {
    throw new Error("Email is required.");
  }

  if (!["admin", "coordinator", "supervisor", "student"].includes(role)) {
    throw new Error("Invalid user role.");
  }

  if (role === "student") {
    return createSetupAccount({
      firstName, lastName, email, phone, createdBy, studentId, studentRecordId,
      course, schoolYear, company, coordinatorUid, coordinatorName,
    }, "student");
  }
  if (role === "coordinator") {
    return createCoordinatorLoginAccount({
      fullName: `${firstName.trim()} ${lastName.trim()}`, email, department, createdBy,
    });
  }

 // GENERATE TEMPORARY PASSWORD
  const temporaryPassword = generateTemporaryPassword(12);
  let firebaseUser;
  let profileSaved = false;

  try {
    // CREATE FIREBASE AUTH ACCOUNT

    const credential = await createUserWithEmailAndPassword(
      secondaryAuth,
      email.trim(),
      temporaryPassword,
    );

    firebaseUser = credential.user;

    //SET DISPLAY NAME
    await updateProfile(firebaseUser, {
      displayName: `${firstName.trim()} ${lastName.trim()}`,
    });

    //FIRESTORE DOCUMENT
    // users/{Firebase UID}
    const userRef = doc(db, "users", firebaseUser.uid);
    const profile = {
      uid: firebaseUser.uid,
      email: email.trim(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone?.trim() || "",
      role,
      status: "ACTIVE",
      isActive: true,
      isArchived: false,
      mustChangePassword: true,
      ...(studentId ? { studentId } : {}),
      ...(studentRecordId ? { studentRecordId } : {}),
      ...(coordinatorId ? { coordinatorId } : {}),
      ...(course ? { course } : {}),
      ...(schoolYear ? { schoolYear } : {}),
      ...(company ? { company } : {}),
      ...(coordinatorUid ? { coordinatorUid } : {}),
      ...(coordinatorName ? { coordinatorName } : {}),
      ...(department ? { ...departmentFields(department), department } : {}),
      ...(assignedIds[0] ? { assignedStudentRecordId: assignedIds[0] } : {}),
      ...(role === "supervisor"
        ? { partnerCompanyId: partnerCompanyId || null }
        : partnerCompanyId
          ? { partnerCompanyId }
          : {}),
      ...(position ? { position: position.trim() } : {}),
      createdAt: serverTimestamp(),
      createdBy: createdBy || null,
      updatedAt: serverTimestamp(),
    };
    const roleRef = roleAccountRef(role, firebaseUser.uid);
    const roleProfile = toRoleProfile(profile, firebaseUser.uid);

    if (role === "supervisor" && assignedIds.length > 0) {
      const studentRefs = assignedIds.map((id) => doc(db, "students", id));
      const studentUserUids = [];
      const supervisorName = `${firstName.trim()} ${lastName.trim()}`;
      await runTransaction(db, async (transaction) => {
        const snapshots = await Promise.all(studentRefs.map((ref) => transaction.get(ref)));
        snapshots.forEach((snapshot) => {
          if (!snapshot.exists()) {
            throw new Error("A selected OJT student no longer exists.");
          }
          const student = snapshot.data();
          if (student.coordinatorUid !== createdBy) {
            throw new Error("You can only assign supervisors to students in your department.");
          }
          if (student.supervisorUid) {
            throw new Error(`${student.name || student.studentId || "A selected student"} already has an assigned supervisor.`);
          }
          if (schoolYear && student.schoolYear && student.schoolYear !== schoolYear) {
            throw new Error(
              `${student.name || student.studentId || "A selected student"} is assigned to School Year ${student.schoolYear}.`,
            );
          }
        });

        transaction.set(userRef, profile);
        transaction.set(roleRef, roleProfile);
        snapshots.forEach((snapshot, index) => {
          studentUserUids.push(snapshot.data().studentUid || null);
          transaction.update(studentRefs[index], {
            supervisorUid: firebaseUser.uid,
            supervisorName,
            supervisorSchoolYear: schoolYear || snapshot.data().schoolYear || "",
            partnerCompanyId: partnerCompanyId || null,
            company,
            updatedAt: serverTimestamp(),
          });
        });
      });

      await Promise.all(
        studentUserUids.filter(Boolean).map((studentUserUid) =>
          Promise.all([
            updateDoc(doc(db, "users", studentUserUid), {
              supervisorUid: firebaseUser.uid,
              supervisorName,
              supervisorSchoolYear: schoolYear || "",
              updatedAt: serverTimestamp(),
            }),
            syncStudentAccount(studentUserUid, {
              supervisorUid: firebaseUser.uid,
              supervisorName,
              supervisorSchoolYear: schoolYear || "",
              updatedAt: serverTimestamp(),
            }),
          ]).catch((syncError) => {
            console.warn("Unable to sync supervisor assignment to student account:", syncError);
          }),
        ),
      );
    } else {
      const batch = writeBatch(db);
      batch.set(userRef, profile);
      if (roleRef) batch.set(roleRef, roleProfile);
      await batch.commit();
    }
    profileSaved = true;

    //SIGN OUT SECONDARY AUTH
    //This keeps the ADMIN logged into the primary auth.
    try {
      await signOut(secondaryAuth);
    } catch (signOutError) {
      console.warn("Supervisor profile was created, but secondary Auth sign-out failed:", signOutError);
    }

    // RETURN INFORMATION TO ADMIN PAGE
    return {
      uid: firebaseUser.uid,
      email: email.trim(),
      temporaryPassword,
      role,
    };
  } catch (error) {
    console.error("Create managed user error:", error);

    if (firebaseUser && !profileSaved) {
      try {
        await deleteUser(firebaseUser);
      } catch (cleanupError) {
        console.error("Unable to remove the unlinked supervisor Auth account:", cleanupError);
      }
    }

    // Make sure secondary auth isn't left logged in.
    try {
      await signOut(secondaryAuth);
    } catch {
      // Ignore sign-out error
    }
   // FIREBASE ERRORS
    switch (error.code) {
      case "auth/email-already-in-use":
        throw new Error("This email address is already registered.", {
          cause: error,
        });

      case "auth/invalid-email":
        throw new Error("Please enter a valid email address.", {
          cause: error,
        });

      case "auth/weak-password":
        throw new Error("The generated password was rejected by Firebase.", {
          cause: error,
        });

      case "permission-denied":
      case "firestore/permission-denied":
        throw new Error("You do not have permission to create this user.", {
          cause: error,
        });

      default:
        throw new Error(error.message || "Failed to create user account.", {
          cause: error,
        });
    }
  }
};

export const resendStudentAccountNotification = async (studentRecordId) => {
  if (!studentRecordId) throw new Error("A student record is required.");
  await requireAdminSession(auth.currentUser?.uid);
  const roster = await getDoc(doc(db, "students", studentRecordId));
  if (!roster.exists()) throw new Error("The student roster record no longer exists.");
  const uid = roster.data().studentUid || roster.data().userUid || roster.data().accountUid;
  if (!uid) throw new Error("This student does not have a linked login account.");
  return resendSetupEmail(uid, "student", studentRecordId);
};

export const completePasswordChange = async (user, currentPassword, newPassword) => {
  if (!user) throw new Error("No authenticated user found.");
  await callAccountFunction("completePasswordChange", {
    currentPassword, newPassword, apiKey: firebaseConfig.apiKey,
  });
};
