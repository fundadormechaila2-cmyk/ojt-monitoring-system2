import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { where } from "firebase/firestore";
import { AttendanceContext } from "./AttendanceContextDefinition";
import { createCollectionDocument, deleteCollectionDocument, subscribeToCollection, updateCollectionDocument } from "../services/firestoreDataService";
import { useAuth } from "./useAuth";
import { auth } from "../services/firebase";
import { subscribeToCoordinatorAttendance } from "../services/coordinatorAttendanceService";
import { recordDepartmentId } from "../constants/departments";

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
  const departmentId = recordDepartmentId(user);
  const [authentication, setAuthentication] = useState({ uid: null, generation: 0 });
  const [state, setState] = useState({ key: "", records: [], error: "" });
  const [retryKey, setRetryKey] = useState(0);
  const uid = user?.uid;
  const role = user?.role;
  const signedIn = Boolean(authentication.uid && authentication.uid === uid && auth.currentUser?.uid === uid);
  const supportedRole = ["admin", "staff", "coordinator", "student", "supervisor"].includes(role);
  const missingDepartment = signedIn && role === "coordinator" && !departmentId;
  const canSubscribe = signedIn && supportedRole && !missingDepartment;
  const key = JSON.stringify([authentication.generation, uid, role, departmentId, retryKey]);

  useEffect(() => onAuthStateChanged(auth, (currentUser) => {
    setAuthentication((current) => ({ uid: currentUser?.uid || "", generation: current.generation + 1 }));
  }), []);

  useEffect(() => {
    if (!canSubscribe) return undefined;
    let active = true;
    const onRecords = (items) => {
      if (!active || auth.currentUser?.uid !== uid) return;
      setState({ key, records: items.map(normalizeAttendance), error: "" });
    };
    const onError = (snapshotError) => {
      if (!active || auth.currentUser?.uid !== uid) return;
      console.error("Unable to load attendance records:", snapshotError);
      setState({
        key,
        records: [],
        error: snapshotError.code === "permission-denied" ? "You do not have permission to view attendance records." : "Attendance records could not be loaded.",
      });
    };
    const unsubscribe = role === "coordinator"
      ? subscribeToCoordinatorAttendance(uid, departmentId, onRecords, onError)
      : subscribeToCollection(
          "attendance",
          role === "student"
            ? [where("studentUid", "==", uid)]
            : role === "supervisor"
              ? [where("supervisorId", "==", uid)]
              : [],
          onRecords,
          onError,
        );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [canSubscribe, uid, role, departmentId, key]);

  const retry = () => setRetryKey((current) => current + 1);
  const updateRecord = (recordId, changes) => updateCollectionDocument("attendance", recordId, changes);
  const addRecord = (record) => createCollectionDocument("attendance", record);
  const removeRecord = (recordId) => deleteCollectionDocument("attendance", recordId);

  return <AttendanceContext.Provider value={{
    records: canSubscribe && state.key === key ? state.records : [],
    loading: canSubscribe && state.key !== key,
    error: missingDepartment
      ? "Your coordinator account has no recognized department. Ask an administrator to assign one in OJT Coordinators."
      : signedIn && !supportedRole
        ? "Your account does not have a recognized role for attendance."
        : canSubscribe && state.key === key ? state.error : "",
    retry, updateRecord, addRecord, removeRecord,
  }}>{children}</AttendanceContext.Provider>;
}
