import {
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
} from "firebase/auth";

import { doc, setDoc, serverTimestamp } from "firebase/firestore";

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
  studentId,
  studentRecordId,
  course,
  company,
  coordinatorId,
  department,
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

  if (!["admin", "coordinator", "supervisor", "student"].includes(role)) {
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
      ...(studentId ? { studentId } : {}),
      ...(studentRecordId ? { studentRecordId } : {}),
      ...(course ? { course } : {}),
      ...(company ? { company } : {}),
      ...(coordinatorId ? { coordinatorId } : {}),
      ...(department ? { department } : {}),
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
