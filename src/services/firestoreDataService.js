import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";

export function subscribeToCollection(
  collectionName,
  constraints,
  onData,
  onError,
) {
  const reference = collection(db, collectionName);
  const target = constraints?.length
    ? query(reference, ...constraints)
    : reference;

  return onSnapshot(
    target,
    (snapshot) =>
      onData(
        snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data(),
        })),
      ),
    onError,
  );
}

export async function createCollectionDocument(collectionName, data) {
  return addDoc(collection(db, collectionName), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateCollectionDocument(
  collectionName,
  documentId,
  data,
) {
  return updateDoc(doc(db, collectionName, documentId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteCollectionDocument(collectionName, documentId) {
  return deleteDoc(doc(db, collectionName, documentId));
}

export function getTimestampValue(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateValue(value) {
  const date = getTimestampValue(value);
  return date ? date.toISOString().slice(0, 10) : "";
}

export function formatDateTimeValue(value) {
  const date = getTimestampValue(value);
  return date
    ? date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
    : "Recently";
}
