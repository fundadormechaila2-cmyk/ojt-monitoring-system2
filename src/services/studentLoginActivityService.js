import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

function studentNameOf(profile) {
  return (
    profile.name ||
    profile.fullName ||
    `${profile.firstName || ""} ${profile.lastName || ""}`.trim() ||
    profile.email ||
    "Student"
  );
}

export async function recordStudentLogin(user, profile) {
  if (!user?.uid || profile?.role !== "student") {
    throw new Error("A valid student account is required to record sign-in activity.");
  }

  await addDoc(collection(db, "studentLoginActivity"), {
    userId: user.uid,
    studentName: studentNameOf(profile),
    studentId: String(
      profile.studentId || profile.studentID || profile.idNumber || "",
    ),
    email: user.email || profile.email || "",
    ...(profile.coordinatorUid
      ? { coordinatorUid: profile.coordinatorUid }
      : {}),
    loggedInAt: serverTimestamp(),
  });
}
