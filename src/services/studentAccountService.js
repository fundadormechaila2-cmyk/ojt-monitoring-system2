import { updateDoc } from "firebase/firestore";
import { roleAccountRef } from "./accountCollections";

export function studentAccountRef(uid) {
  return roleAccountRef("student", uid);
}

// Coordinators cannot read users/{studentUid}, so only the changed fields are written.
export async function syncStudentAccount(uid, changes) {
  if (!uid) return;
  await updateDoc(studentAccountRef(uid), changes);
}
