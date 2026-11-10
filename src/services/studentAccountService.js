import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";

export function studentAccountRef(uid) {
  return doc(db, "studentAccounts", uid);
}

export async function syncStudentAccount(uid, changes) {
  if (!uid) return;
  const userSnapshot = await getDoc(doc(db, "users", uid));
  if (!userSnapshot.exists() || userSnapshot.data().role !== "student") return;

  await setDoc(
    studentAccountRef(uid),
    { ...userSnapshot.data(), ...changes, uid },
    { merge: true },
  );
}
