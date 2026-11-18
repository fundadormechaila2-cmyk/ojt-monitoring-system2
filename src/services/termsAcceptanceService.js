import {
  addDoc,
  collection,
  getDocsFromServer,
  limit,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "./firebase";

export const TERMS_VERSION = "lcc-ojt-2026-11-18-v1";

function validateTermsRequest(uid, version) {
  if (!uid) {
    throw new Error("A signed-in user is required to check Terms and Conditions acceptance.");
  }

  if (version !== TERMS_VERSION) {
    throw new Error("The Terms and Conditions version is invalid.");
  }
}

export async function hasAcceptedTerms(uid, version) {
  validateTermsRequest(uid, version);

  const acceptanceQuery = query(
    collection(db, "users", uid, "termsAcceptances"),
    where("version", "==", version),
    limit(1),
  );
  const snapshot = await getDocsFromServer(acceptanceQuery);
  return !snapshot.empty && snapshot.docs[0].data().accepted === true;
}

export async function recordTermsAcceptance(uid, version) {
  validateTermsRequest(uid, version);

  return addDoc(collection(db, "users", uid, "termsAcceptances"), {
    version,
    accepted: true,
    acceptedAt: serverTimestamp(),
  });
}
