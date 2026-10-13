import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "./firebase";

const functions = getFunctions(app);

export async function saveStudentCoordinatorAssignment({
  studentRecordId,
  accountId,
  coordinatorUid,
}) {
  const saveAssignment = httpsCallable(
    functions,
    "saveStudentCoordinatorAssignment",
  );
  const response = await saveAssignment({
    studentRecordId,
    ...(accountId ? { accountId } : {}),
    coordinatorUid,
  });
  return response.data;
}
