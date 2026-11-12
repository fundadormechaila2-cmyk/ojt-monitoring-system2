import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { withoutArchived } from "./recordState";

export function subscribeToCoordinatorAttendance(uid, departmentId, onRecords, onError) {
  let active = true;
  let generation = 0;
  let attendanceUnsubscribers = [];
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
      attendanceUnsubscribers = studentUids.map((studentUid) =>
        onSnapshot(
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
            if (!active || failed || generation !== currentGeneration) return;
            failed = true;
            onError(error);
          },
        ),
      );
    },
    (error) => {
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
