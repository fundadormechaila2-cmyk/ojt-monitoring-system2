import {
  deleteField,
  doc,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";

function personName(person) {
  return (
    `${person.firstName || ""} ${person.lastName || ""}`.trim() ||
    person.fullName ||
    person.name ||
    person.email ||
    ""
  );
}

async function syncStudentAccount(studentUid, changes) {
  if (!studentUid) return;
  try {
    await updateDoc(doc(db, "users", studentUid), changes);
  } catch (error) {
    console.warn("Unable to sync supervisor assignment to the student account:", error);
  }
}

// Assigns (or reassigns) students to one supervisor. Each student keeps a single
// supervisorUid, so one supervisor can hold many students without duplicates.
export async function assignStudentsToSupervisor({ coordinator, supervisor, studentIds }) {
  const ids = [...new Set(studentIds || [])].filter(Boolean);
  if (!coordinator?.uid || coordinator.role !== "coordinator") {
    throw new Error("Only coordinators can assign students.");
  }
  if (!supervisor?.id || supervisor.role !== "supervisor") {
    throw new Error("Select a valid supervisor.");
  }
  if (
    !coordinator.department ||
    String(supervisor.department || "").trim().toLowerCase() !==
      String(coordinator.department).trim().toLowerCase()
  ) {
    throw new Error("You can only manage supervisors in your department.");
  }
  if (ids.length === 0) {
    throw new Error("Select at least one student.");
  }

  const supervisorName = personName(supervisor);
  const company = supervisor.company || "";
  const studentUids = [];

  await runTransaction(db, async (transaction) => {
    const refs = ids.map((id) => doc(db, "students", id));
    const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
    snapshots.forEach((snapshot) => {
      if (!snapshot.exists()) throw new Error("A selected student no longer exists.");
      const student = snapshot.data();
      if (student.coordinatorUid !== coordinator.uid) {
        throw new Error("You can only assign students from your own roster.");
      }
      if (student.supervisorUid === supervisor.id) {
        throw new Error(`${student.name || student.studentId || "A student"} is already assigned to this supervisor.`);
      }
    });
    snapshots.forEach((snapshot, index) => {
      studentUids.push(snapshot.data().studentUid || null);
      transaction.update(refs[index], {
        supervisorUid: supervisor.id,
        supervisorName,
        ...(company ? { company } : {}),
        ...(supervisor.partnerCompanyId ? { partnerCompanyId: supervisor.partnerCompanyId } : {}),
        updatedAt: serverTimestamp(),
      });
    });
  });

  await Promise.all(
    studentUids.map((uid) =>
      syncStudentAccount(uid, {
        supervisorUid: supervisor.id,
        supervisorName,
        updatedAt: serverTimestamp(),
      }),
    ),
  );
  return ids.length;
}

// Removes one student from their supervisor without touching the supervisor account.
export async function unassignStudent({ coordinator, student }) {
  if (!coordinator?.uid || student?.coordinatorUid !== coordinator.uid) {
    throw new Error("You can only change students on your own roster.");
  }
  const changes = {
    supervisorUid: deleteField(),
    supervisorName: deleteField(),
    updatedAt: serverTimestamp(),
  };
  await updateDoc(doc(db, "students", student.id), changes);
  await syncStudentAccount(student.studentUid, changes);
}
