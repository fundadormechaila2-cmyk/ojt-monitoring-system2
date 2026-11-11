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
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

import { secondaryAuth } from "./secondatyAuth";
import { auth, db } from "./firebase";
import { studentAccountRef, syncStudentAccount } from "./studentAccountService";
import { departmentFields, studentDepartmentFields } from "../constants/departments";
import { isAccountLive } from "./recordState";

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

async function requireAdminSession(createdBy, accountType = "student") {
  const admin = auth.currentUser;
  if (!admin || admin.uid !== createdBy) {
    throw new Error(
      `Sign in as an administrator before creating ${accountType} accounts.`,
    );
  }
  const adminSnapshot = await getDoc(doc(db, "users", admin.uid));
  if (
    !adminSnapshot.exists() ||
    adminSnapshot.data().role !== "admin" ||
    !isAccountLive(adminSnapshot.data())
  ) {
    throw new Error(
      `Only an active administrator can create ${accountType} accounts.`,
    );
  }
}

async function writeCoordinatorNotificationStatus(uid, status) {
  await updateDoc(doc(db, "users", uid), {
    accountNotificationStatus: status,
    accountNotificationUpdatedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function createCoordinatorLoginAccount({
  fullName,
  email,
  department,
  createdBy,
}) {
  await requireAdminSession(createdBy, "coordinator");

  const normalizedName = String(fullName || "").trim().replace(/\s+/g, " ");
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedDepartment = departmentFields(department);
  if (!normalizedName || normalizedName.length > 120) {
    throw new Error("Enter a full name of 1 to 120 characters.");
  }
  if (
    !normalizedEmail ||
    normalizedEmail.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
  ) {
    throw new Error("Enter a valid email address.");
  }
  if (!normalizedDepartment.departmentId) {
    throw new Error("Select a valid coordinator department.");
  }

  const [firstName, ...lastNameParts] = normalizedName.split(" ");
  const lastName = lastNameParts.join(" ");
  const temporaryPassword = generateTemporaryPassword(20);
  let firebaseUser;

  try {
    const credential = await createUserWithEmailAndPassword(
      secondaryAuth,
      normalizedEmail,
      temporaryPassword,
    );
    firebaseUser = credential.user;
    await updateProfile(firebaseUser, { displayName: normalizedName });

    const profile = {
      uid: firebaseUser.uid,
      coordinatorId: `COORD-${firebaseUser.uid}`,
      firstName,
      lastName,
      fullName: normalizedName,
      email: normalizedEmail,
      ...normalizedDepartment,
      role: "coordinator",
      status: "ACTIVE",
      accountStatus: "ACTIVE",
      isActive: true,
      isArchived: false,
      mustChangePassword: false,
      accountNotificationStatus: "Pending",
      accountNotificationUpdatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      createdBy,
      updatedAt: serverTimestamp(),
    };
    await setDoc(doc(db, "users", firebaseUser.uid), profile);

    try {
      await sendPasswordResetEmail(secondaryAuth, normalizedEmail);
    } catch (emailError) {
      console.error("Unable to send coordinator password setup email:", emailError);
      try {
        await writeCoordinatorNotificationStatus(firebaseUser.uid, "Failed");
      } catch (statusError) {
        console.error(
          "Unable to save the failed coordinator setup email status:",
          statusError,
        );
      }
      return {
        uid: firebaseUser.uid,
        email: normalizedEmail,
        role: "coordinator",
        emailStatus: "Failed",
      };
    }

    let notificationStatusSaved = true;
    try {
      await writeCoordinatorNotificationStatus(firebaseUser.uid, "Sent");
    } catch (statusError) {
      notificationStatusSaved = false;
      console.error(
        "Coordinator setup email was sent, but its status could not be saved:",
        statusError,
      );
    }
    return {
      uid: firebaseUser.uid,
      email: normalizedEmail,
      role: "coordinator",
      emailStatus: "Sent",
      notificationStatusSaved,
    };
  } catch (error) {
    if (firebaseUser) {
      try {
        await deleteUser(firebaseUser);
      } catch (cleanupError) {
        console.error(
          "Unable to remove the unlinked coordinator Auth account:",
          cleanupError,
        );
      }
    }
    if (error.code === "auth/email-already-in-use") {
      throw new Error("This email address is already registered.", { cause: error });
    }
    if (error.code === "auth/invalid-email") {
      throw new Error("Please enter a valid email address.", { cause: error });
    }
    if (
      error.code === "permission-denied" ||
      error.code === "firestore/permission-denied"
    ) {
      throw new Error(
        "You do not have permission to create coordinator accounts. Sign in as an administrator and try again.",
        { cause: error },
      );
    }
    throw new Error(error.message || "Failed to create coordinator account.", {
      cause: error,
    });
  } finally {
    try {
      await signOut(secondaryAuth);
    } catch (signOutError) {
      console.error(
        "Unable to sign out the secondary coordinator account session:",
        signOutError,
      );
    }
  }
}

export async function resendCoordinatorSetupEmail(uid) {
  if (!uid) throw new Error("A coordinator account is required.");
  await requireAdminSession(auth.currentUser?.uid, "coordinator");

  const profileRef = doc(db, "users", uid);
  const profileSnapshot = await getDoc(profileRef);
  if (!profileSnapshot.exists() || profileSnapshot.data().role !== "coordinator") {
    throw new Error("The coordinator account could not be found.");
  }
  if (!isAccountLive(profileSnapshot.data())) {
    throw new Error("This coordinator account is inactive or archived.");
  }
  const email = String(profileSnapshot.data().email || "").trim().toLowerCase();
  if (!email) throw new Error("The coordinator account has no email address.");

  await writeCoordinatorNotificationStatus(uid, "Pending");
  try {
    await sendPasswordResetEmail(secondaryAuth, email);
  } catch (emailError) {
    console.error("Unable to resend coordinator password setup email:", emailError);
    try {
      await writeCoordinatorNotificationStatus(uid, "Failed");
    } catch (statusError) {
      console.error(
        "Unable to save the failed coordinator setup email status:",
        statusError,
      );
    }
    return { uid, email, emailStatus: "Failed" };
  }

  let notificationStatusSaved = true;
  try {
    await writeCoordinatorNotificationStatus(uid, "Sent");
  } catch (statusError) {
    notificationStatusSaved = false;
    console.error(
      "Coordinator setup email was sent, but its status could not be saved:",
      statusError,
    );
  }
  return { uid, email, emailStatus: "Sent", notificationStatusSaved };
}

async function writeStudentNotificationStatus(uid, studentRecordId, status) {
  const changes = {
    accountNotificationStatus: status,
    accountNotificationUpdatedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const batch = writeBatch(db);
  batch.set(doc(db, "users", uid), changes, { merge: true });
  batch.set(studentAccountRef(uid), changes, { merge: true });
  if (studentRecordId) {
    batch.set(doc(db, "students", studentRecordId), changes, { merge: true });
  }
  await batch.commit();
}

async function createStudentLoginAccount({
  firstName,
  lastName,
  email,
  phone,
  createdBy,
  studentId,
  studentRecordId,
  course,
  schoolYear,
  company,
  coordinatorUid,
  coordinatorName,
}) {
  await requireAdminSession(createdBy);

  const normalizedEmail = email.trim().toLowerCase();
  const temporaryPassword = generateTemporaryPassword(20);
  let firebaseUser;
  let profileSaved = false;

  try {
    const credential = await createUserWithEmailAndPassword(
      secondaryAuth,
      normalizedEmail,
      temporaryPassword,
    );
    firebaseUser = credential.user;

    await updateProfile(firebaseUser, {
      displayName: `${firstName.trim()} ${lastName.trim()}`,
    });

    const profile = {
      uid: firebaseUser.uid,
      email: normalizedEmail,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone?.trim() || "",
      role: "student",
      status: "ACTIVE",
      isActive: true,
      isArchived: false,
      mustChangePassword: false,
      ...(studentId ? { studentId } : {}),
      ...(studentRecordId ? { studentRecordId } : {}),
      ...(course ? { course, ...studentDepartmentFields(course) } : {}),
      ...(schoolYear ? { schoolYear } : {}),
      ...(company ? { company } : {}),
      ...(coordinatorUid ? { coordinatorUid } : {}),
      ...(coordinatorName ? { coordinatorName } : {}),
      accountNotificationStatus: "Pending",
      accountNotificationUpdatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      createdBy,
      updatedAt: serverTimestamp(),
    };
    const userRef = doc(db, "users", firebaseUser.uid);
    const studentProfileRef = studentAccountRef(firebaseUser.uid);

    if (studentRecordId) {
      const rosterRef = doc(db, "students", studentRecordId);
      await runTransaction(db, async (transaction) => {
        const rosterSnapshot = await transaction.get(rosterRef);
        if (!rosterSnapshot.exists()) {
          throw new Error("The student roster record no longer exists.");
        }
        const roster = rosterSnapshot.data();
        if (roster.studentUid || roster.userUid || roster.accountUid) {
          throw new Error("This student record is already linked to a login account.");
        }

        transaction.set(userRef, profile);
        transaction.set(studentProfileRef, profile);
        transaction.update(rosterRef, {
          firstName: profile.firstName,
          lastName: profile.lastName,
          name: `${profile.firstName} ${profile.lastName}`,
          email: normalizedEmail,
          accountEmail: normalizedEmail,
          studentUid: firebaseUser.uid,
          accountNotificationStatus: "Pending",
          accountNotificationUpdatedAt: serverTimestamp(),
          ...(coordinatorUid ? { coordinatorUid } : {}),
          ...(coordinatorName ? { coordinatorName } : {}),
          updatedAt: serverTimestamp(),
        });
      });
    } else {
      const batch = writeBatch(db);
      batch.set(userRef, profile);
      batch.set(studentProfileRef, profile);
      await batch.commit();
    }
    profileSaved = true;

    try {
      await sendPasswordResetEmail(secondaryAuth, normalizedEmail);
    } catch (emailError) {
      console.error("Unable to send student password setup email:", emailError);
      try {
        await writeStudentNotificationStatus(
          firebaseUser.uid,
          studentRecordId,
          "Failed",
        );
      } catch (statusError) {
        console.error("Unable to save the failed password setup email status:", statusError);
      }
      return {
        uid: firebaseUser.uid,
        email: normalizedEmail,
        role: "student",
        alreadyExists: false,
        emailStatus: "Failed",
      };
    }

    let notificationStatusSaved = true;
    try {
      await writeStudentNotificationStatus(
        firebaseUser.uid,
        studentRecordId,
        "Sent",
      );
    } catch (statusError) {
      notificationStatusSaved = false;
      console.error("Password setup email was sent, but its status could not be saved:", statusError);
    }
    return {
      uid: firebaseUser.uid,
      email: normalizedEmail,
      role: "student",
      alreadyExists: false,
      emailStatus: "Sent",
      notificationStatusSaved,
    };
  } catch (error) {
    if (firebaseUser && !profileSaved) {
      try {
        await deleteUser(firebaseUser);
      } catch (cleanupError) {
        console.error("Unable to remove the unlinked student Auth account:", cleanupError);
      }
    }

    if (error.code === "auth/email-already-in-use") {
      throw new Error("This email address is already registered.", { cause: error });
    }
    if (error.code === "auth/invalid-email") {
      throw new Error("Please enter a valid student email address.", { cause: error });
    }
    if (
      error.code === "permission-denied" ||
      error.code === "firestore/permission-denied"
    ) {
      throw new Error(
        "You do not have permission to create student accounts. Check that you are signed in as an administrator.",
        { cause: error },
      );
    }
    throw new Error(error.message || "Failed to create the student account.", {
      cause: error,
    });
  } finally {
    try {
      await signOut(secondaryAuth);
    } catch (signOutError) {
      console.error("Unable to sign out the secondary student account session:", signOutError);
    }
  }
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
    return createStudentLoginAccount({
      firstName,
      lastName,
      email,
      phone,
      createdBy,
      studentId,
      studentRecordId,
      course,
      schoolYear,
      company,
      coordinatorUid,
      coordinatorName,
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
      ...(department ? { department, ...departmentFields(department) } : {}),
      ...(role === "student" && course ? studentDepartmentFields(course) : {}),
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
    } else if (role === "student") {
      const batch = writeBatch(db);
      batch.set(userRef, profile);
      batch.set(studentAccountRef(firebaseUser.uid), profile);
      await batch.commit();
    } else {
      await setDoc(userRef, profile);
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
  if (!studentRecordId) {
    throw new Error("A student record is required.");
  }
  await requireAdminSession(auth.currentUser?.uid);

  const rosterRef = doc(db, "students", studentRecordId);
  const rosterSnapshot = await getDoc(rosterRef);
  if (!rosterSnapshot.exists()) {
    throw new Error("The student roster record no longer exists.");
  }
  const roster = rosterSnapshot.data();
  const uid = roster.studentUid || roster.userUid || roster.accountUid;
  if (!uid) {
    throw new Error("This student does not have a linked login account.");
  }

  const userSnapshot = await getDoc(doc(db, "users", uid));
  if (!userSnapshot.exists() || userSnapshot.data().role !== "student") {
    throw new Error("The linked login is not a student account.");
  }
  if (!isAccountLive(userSnapshot.data())) {
    throw new Error("This student account is inactive or archived.");
  }
  const email = String(
    userSnapshot.data().email ||
      roster.accountEmail ||
      roster.email ||
      "",
  )
    .trim()
    .toLowerCase();
  if (!email) {
    throw new Error("The student account has no email address.");
  }

  await writeStudentNotificationStatus(uid, studentRecordId, "Pending");
  try {
    await sendPasswordResetEmail(secondaryAuth, email);
  } catch (emailError) {
    console.error("Unable to resend student password setup email:", emailError);
    try {
      await writeStudentNotificationStatus(uid, studentRecordId, "Failed");
    } catch (statusError) {
      console.error("Unable to save the failed password setup email status:", statusError);
    }
    return { uid, email, emailStatus: "Failed" };
  }
  let notificationStatusSaved = true;
  try {
    await writeStudentNotificationStatus(uid, studentRecordId, "Sent");
  } catch (statusError) {
    notificationStatusSaved = false;
    console.error("Password setup email was sent, but its status could not be saved:", statusError);
  }
  return { uid, email, emailStatus: "Sent", notificationStatusSaved };
};

//COMPLETE FIRST-TIME PASSWORD CHANGE

export const completePasswordChange = async (user, newPassword) => {
  if (!user) {
    throw new Error("No authenticated user found.");
  }

  if (!newPassword) {
    throw new Error("Please enter a new password.");
  }

  if (newPassword.length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }

  try {
    //UPDATE FIREBASE AUTH PASSWORD
    const { updatePassword } = await import("firebase/auth");

    await updatePassword(user, newPassword);

    //UPDATE FIRESTORE
  
    const changes = {
      mustChangePassword: false,
      updatedAt: serverTimestamp(),
    };
    const userRef = doc(db, "users", user.uid);
    const userSnapshot = await getDoc(userRef);
    if (userSnapshot.exists() && userSnapshot.data().role === "student") {
      const batch = writeBatch(db);
      batch.set(userRef, changes, { merge: true });
      batch.set(
        studentAccountRef(user.uid),
        { ...userSnapshot.data(), ...changes, uid: user.uid },
        { merge: true },
      );
      await batch.commit();
    } else {
      await setDoc(userRef, changes, { merge: true });
    }

    return true;
  } catch (error) {
    console.error("Password change error:", error);

    if (error.code === "auth/requires-recent-login") {
      throw new Error(
        "For security, please log in again before changing your password.",
        { cause: error },
      );
    }

    if (error.code === "auth/weak-password") {
      throw new Error("Password must be at least 6 characters.", {
        cause: error,
      });
    }

    throw new Error(error.message || "Failed to change password.", {
      cause: error,
    });
  }
};
