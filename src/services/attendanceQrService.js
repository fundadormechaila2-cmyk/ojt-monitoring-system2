import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "./firebase";

const functions = getFunctions(app);

export async function issueStudentAttendanceQrToken() {
  const issueToken = httpsCallable(functions, "issueStudentAttendanceQrToken");
  const response = await issueToken();
  return response.data;
}

export async function scanStudentAttendanceQr(token, period) {
  const scanStudentQr = httpsCallable(functions, "scanStudentAttendanceQr");
  const response = await scanStudentQr({
    token,
    ...(period ? { period } : {}),
  });
  return response.data;
}

export async function recordManualStudentAttendance(record) {
  const recordAttendance = httpsCallable(
    functions,
    "recordManualStudentAttendance",
  );
  const response = await recordAttendance(record);
  return response.data;
}
