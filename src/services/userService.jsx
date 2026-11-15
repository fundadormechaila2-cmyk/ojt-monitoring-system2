import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { getRoleProfile, roleCollectionFor } from "./accountCollections";
import { logLoginDiagnostic } from "./temporaryLoginDiagnostics";

// users/{uid} decides the role and access state; the profile details come from
// the matching role collection (coordinatorsAccount, supervisorsAccount, studentsAccount).
const ACCESS_FIELDS = ["role", "status", "isActive", "isArchived", "mustChangePassword", "deletionPending"];

export const getUserData = async (uid, caller = "") => {
    const docRef = doc(db, "users", uid);
    const source = caller ? `${caller} -> getUserData` : "getUserData";
    const request = { source, path: docRef.path, requestedUid: uid };
    logLoginDiagnostic({ ...request, stage: "read-start" });
    let docSnap;
    try {
        docSnap = await getDoc(docRef);
    } catch (error) {
        logLoginDiagnostic({ ...request, stage: "read-error", error });
        throw error;
    }

    if (!docSnap.exists()) return null;

    const account = docSnap.data();
    let roleProfile = null;
    const roleCollection = roleCollectionFor(account.role);
    const roleRequest = roleCollection
        ? { source: `${source} -> getRoleProfile`, path: `${roleCollection}/${uid}`, requestedUid: uid }
        : null;
    try {
        if (roleRequest) logLoginDiagnostic({ ...roleRequest, stage: "read-start" });
        roleProfile = await getRoleProfile(account.role, uid);
    } catch (error) {
        if (roleRequest) logLoginDiagnostic({ ...roleRequest, stage: "read-error", error });
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
