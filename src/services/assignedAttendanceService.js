import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "./firebase";

export function subscribeToAssignedAttendance({
  role,
  userUid,
  date,
  onRecords,
  onError,
}) {
  const assignmentField = role === "coordinator" ? "coordinatorUid" : "supervisorId";
  const dateConstraint = date ? [where("date", "==", date)] : [];
  return onSnapshot(
    query(
      collection(db, "attendance"),
      where(assignmentField, "==", userUid),
      ...dateConstraint,
    ),
    (snapshot) => {
      onRecords(
        snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data(),
        })),
      );
    },
    onError,
  );
}
