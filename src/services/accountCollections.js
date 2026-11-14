import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";

// Role-separated account profiles. Each document id is the Firebase Auth UID.
export const ROLE_COLLECTIONS = {
  coordinator: "coordinatorsAccount",
  supervisor: "supervisorsAccount",
  student: "studentsAccount",
};

// Credentials never belong in the role profile collections.
const SECRET_FIELDS = ["temporaryPassword", "password"];

export function roleCollectionFor(role) {
  return ROLE_COLLECTIONS[role] || null;
}

export function roleAccountRef(role, uid) {
  const collectionName = roleCollectionFor(role);
  return collectionName && uid ? doc(db, collectionName, uid) : null;
}

export function toRoleProfile(profile, uid) {
  const clean = { ...profile, uid };
  SECRET_FIELDS.forEach((field) => delete clean[field]);
  return clean;
}

export async function getRoleProfile(role, uid) {
  const ref = roleAccountRef(role, uid);
  if (!ref) return null;
  const snapshot = await getDoc(ref);
  return snapshot.exists() ? snapshot.data() : null;
}

// Merges changes into the role profile, seeding it from users/{uid} when missing.
export async function syncRoleAccount(uid, changes = {}) {
  if (!uid) return;
  const userSnapshot = await getDoc(doc(db, "users", uid));
  if (!userSnapshot.exists()) return;
  const ref = roleAccountRef(userSnapshot.data().role, uid);
  if (!ref) return;
  await setDoc(
    ref,
    toRoleProfile({ ...userSnapshot.data(), ...changes }, uid),
    { merge: true },
  );
}
