import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { getRoleProfile } from "./accountCollections";

// users/{uid} decides the role and access state; the profile details come from
// the matching role collection (coordinatorsAccount, supervisorsAccount, studentsAccount).
const ACCESS_FIELDS = ["role", "status", "isActive", "isArchived", "mustChangePassword", "deletionPending"];

export const getUserData = async (uid) => {
    const docRef = doc(db, "users", uid);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) return null;

    const account = docSnap.data();
    let roleProfile = null;
    try {
        roleProfile = await getRoleProfile(account.role, uid);
    } catch (error) {
        console.warn("Unable to load the role account profile:", error);
    }
    if (!roleProfile) return account;

    const access = Object.fromEntries(
        ACCESS_FIELDS.filter((field) => field in account).map((field) => [field, account[field]]),
    );
    return { ...account, ...roleProfile, ...access, uid };
};

export const createUserProfile = async (uid, profile) => {
    await setDoc(doc(db, "users", uid), profile);
};
