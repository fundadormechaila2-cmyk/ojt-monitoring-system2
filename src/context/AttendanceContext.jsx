import { useEffect, useState } from "react";
import { where } from "firebase/firestore";
import { AttendanceContext } from "./AttendanceContextDefinition";
import { createCollectionDocument, deleteCollectionDocument, subscribeToCollection, updateCollectionDocument } from "../services/firestoreDataService";
import { useAuth } from "./useAuth";

const normalizeAttendance = (record) => ({
  ...record,
  student: record.student || record.studentName || "Unnamed student",
  studentId: record.studentId || record.studentID || "Not provided",
  company: record.company || record.partnerCompany || "Not assigned",
  date: record.date || "",
  timeIn: record.timeIn || "--",
  timeOut: record.timeOut || "--",
  hours: Number(record.hours || record.totalHours || 0),
  status: record.status || "Absent",
  note: record.note || "No note recorded",
});

export function AttendanceProvider({ children }) {
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => subscribeToCollection(
    "attendance",
    user?.role === "coordinator"
      ? [where("coordinatorUid", "==", user.uid)]
      : user?.role === "student"
        ? [where("studentUid", "==", user.uid)]
        : user?.role === "supervisor"
          ? [where("supervisorId", "==", user.uid)]
          : [],
    (items) => {
    setRecords(items.map(normalizeAttendance));
    setLoading(false);
    setError("");
  }, (snapshotError) => {
    console.error("Unable to load attendance records:", snapshotError);
    setRecords([]);
    setLoading(false);
    setError(snapshotError.code === "permission-denied" ? "You do not have permission to view attendance records." : "Attendance records could not be loaded.");
  }), [retryKey, user?.role, user?.uid]);

  const retry = () => { setLoading(true); setError(""); setRetryKey((key) => key + 1); };
  const updateRecord = (recordId, changes) => updateCollectionDocument("attendance", recordId, changes);
  const addRecord = (record) => createCollectionDocument("attendance", record);
  const removeRecord = (recordId) => deleteCollectionDocument("attendance", recordId);

  return <AttendanceContext.Provider value={{ records, loading, error, retry, updateRecord, addRecord, removeRecord }}>{children}</AttendanceContext.Provider>;
}
