import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { withoutArchived } from "./recordState";
import { logLoginDiagnostic } from "./temporaryLoginDiagnostics";

export function subscribeToCoordinatorAttendance(uid, departmentId, onRecords, onError) {
  let active = true;
  let generation = 0;
  let attendanceUnsubscribers = [];
  const studentsRequest = { source: "subscribeToCoordinatorAttendance students query", path: "students", requestedUid: uid };
  logLoginDiagnostic({ ...studentsRequest, stage: "listen-start" });
  const unsubscribeStudents = onSnapshot(
    query(collection(db, "students"), where("coordinatorUid", "==", uid), where("departmentId", "==", departmentId)),
    (snapshot) => {
      if (!active) return;
      const currentGeneration = ++generation;
      attendanceUnsubscribers.forEach((unsubscribe) => unsubscribe());
      attendanceUnsubscribers = [];
      const students = withoutArchived(snapshot.docs.map((item) => item.data()));
      const studentUids = [...new Set(
        students.map((student) => student.studentUid || student.userUid || student.accountUid).filter(Boolean),
      )];
      if (!studentUids.length) {
        onRecords([]);
        return;
      }

      const recordsByStudent = new Map();
      let failed = false;
      attendanceUnsubscribers = studentUids.map((studentUid) => {
        const attendanceRequest = { source: "subscribeToCoordinatorAttendance attendance query", path: "attendance", requestedUid: studentUid };
        logLoginDiagnostic({ ...attendanceRequest, stage: "listen-start" });
        return onSnapshot(
          query(collection(db, "attendance"), where("studentUid", "==", studentUid)),
          (attendanceSnapshot) => {
            if (!active || failed || generation !== currentGeneration) return;
            recordsByStudent.set(studentUid, attendanceSnapshot.docs.map((item) => ({
              id: item.id,
              ...item.data(),
            })));
            if (recordsByStudent.size === studentUids.length) {
              onRecords([...recordsByStudent.values()].flat());
            }
          },
          (error) => {
            logLoginDiagnostic({ ...attendanceRequest, stage: "listen-error", error });
            if (!active || failed || generation !== currentGeneration) return;
            failed = true;
            onError(error);
          },
        );
      });
    },
    (error) => {
      logLoginDiagnostic({ ...studentsRequest, stage: "listen-error", error });
      if (active) onError(error);
    },
  );
  return () => {
    active = false;
    generation += 1;
    unsubscribeStudents();
    attendanceUnsubscribers.forEach((unsubscribe) => unsubscribe());
  };
}
