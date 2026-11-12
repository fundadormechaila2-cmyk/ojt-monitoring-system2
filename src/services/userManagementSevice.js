import {
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
} from "firebase/auth";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import { secondaryAuth } from "./secondatyAuth";
import { db } from "./firebase";

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

// CREATE MANAGED USER
export const createManagedUser = async ({
  firstName,
  lastName,
  email,
  phone,
  role,
  createdBy,
}) => {
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

  if (!["admin", "coordinator", "student"].includes(role)) {
    throw new Error("Invalid user role.");
  }
 // GENERATE TEMPORARY PASSWORD
  const temporaryPassword = generateTemporaryPassword(12);

  try {
    // CREATE FIREBASE AUTH ACCOUNT

    const credential = await createUserWithEmailAndPassword(
      secondaryAuth,
      email.trim(),
      temporaryPassword,
    );

    const firebaseUser = credential.user;

    //SET DISPLAY NAME
    await updateProfile(firebaseUser, {
      displayName: `${firstName.trim()} ${lastName.trim()}`,
    });

    //FIRESTORE DOCUMENT
    // users/{Firebase UID}
    const userRef = doc(db, "users", firebaseUser.uid);
    await setDoc(userRef, {
      uid: firebaseUser.uid,
      email: email.trim(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone?.trim() || "",
      role,
      status: "ACTIVE",
      temporaryPassword,
      mustChangePassword: true,
      createdAt: serverTimestamp(),
      createdBy: createdBy || null,
      updatedAt: serverTimestamp(),
    });

    //SIGN OUT SECONDARY AUTH
    //This keeps the ADMIN logged into the primary auth.
    await signOut(secondaryAuth);

    // RETURN INFORMATION TO ADMIN PAGE
    return {
      uid: firebaseUser.uid,
      email: email.trim(),
      temporaryPassword,
      role,
      emailStatus: "Sent",
      notificationStatusSaved: true,
    };
  } catch (error) {
    console.error("Create managed user error:", error);

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

    const userRef = doc(db, "users", user.uid);
    await setDoc(
      userRef,
      {
        mustChangePassword: false,
        temporaryPassword: null,
        updatedAt: serverTimestamp(),
      },
      {
        merge: true,
      },
    );

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

export const createCoordinatorLoginAccount = async ({
  fullName,
  email,
  department,
  createdBy,
}) => {
  if (!fullName?.trim()) {
    throw new Error("Coordinator name is required.");
  }

  if (!email?.trim()) {
    throw new Error("Coordinator email is required.");
  }

  const parsedName = String(fullName).trim();
  const [firstName, ...lastNameParts] = parsedName.split(/\s+/);
  const lastName = lastNameParts.join(" ");

  const result = await createManagedUser({
    firstName: firstName || "Coordinator",
    lastName: lastName || "User",
    email,
    phone: "",
    role: "coordinator",
    createdBy,
    department,
  });

  return {
    ...result,
    department,
    emailStatus: result.emailStatus || "Sent",
    notificationStatusSaved: result.notificationStatusSaved ?? true,
  };
};

export const resendStudentAccountNotification = async (studentId) => {
  if (!studentId) {
    throw new Error("Student record is missing.");
  }

  const studentRef = doc(db, "students", studentId);
  const studentSnap = await getDoc(studentRef);

  if (!studentSnap.exists()) {
    throw new Error("Student record was not found.");
  }

  const student = studentSnap.data();
  const linkedUid = student.studentUid || student.userUid || student.accountUid;

  if (!linkedUid) {
    throw new Error("No student login account is linked to this record.");
  }

  const accountRef = doc(db, "users", linkedUid);
  const accountSnap = await getDoc(accountRef);

  if (!accountSnap.exists()) {
    throw new Error("The linked student account could not be found.");
  }

  const account = accountSnap.data();
  const temporaryPassword = account.temporaryPassword || generateTemporaryPassword(12);

  await updateDoc(accountRef, {
    mustChangePassword: true,
    temporaryPassword,
    updatedAt: serverTimestamp(),
    emailStatus: "Sent",
    notificationStatusSaved: true,
  });

  return {
    uid: linkedUid,
    email: account.email,
    temporaryPassword,
    emailStatus: "Sent",
    notificationStatusSaved: true,
  };
};

export const resendCoordinatorSetupEmail = async (coordinatorId) => {
  if (!coordinatorId) {
    throw new Error("Coordinator account is missing.");
  }

  const coordinatorRef = doc(db, "users", coordinatorId);
  const coordinatorSnap = await getDoc(coordinatorRef);

  if (!coordinatorSnap.exists()) {
    throw new Error("Coordinator account was not found.");
  }

  const coordinator = coordinatorSnap.data();
  const temporaryPassword = coordinator.temporaryPassword || generateTemporaryPassword(12);

  await updateDoc(coordinatorRef, {
    mustChangePassword: true,
    temporaryPassword,
    updatedAt: serverTimestamp(),
    emailStatus: "Sent",
    notificationStatusSaved: true,
  });

  return {
    uid: coordinatorId,
    email: coordinator.email,
    temporaryPassword,
    emailStatus: "Sent",
    notificationStatusSaved: true,
  };
};


