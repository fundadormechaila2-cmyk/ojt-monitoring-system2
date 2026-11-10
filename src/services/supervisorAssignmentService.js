import {
  collection,
  deleteField,
  doc,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import { syncStudentAccount as syncStudentAccountProfile } from "./studentAccountService";
import { recordDepartmentId, sameDepartment } from "../constants/departments";

function personName(person) {
  return (
    `${person.firstName || ""} ${person.lastName || ""}`.trim() ||
    person.fullName ||
    person.name ||
    person.email ||
    ""
  );
}

function historyEntry(
  supervisor,
  student,
  coordinator,
  reason,
  previousSupervisor = null,
) {
  return {
    supervisorUid: supervisor.id,
    supervisorName: personName(supervisor),
    studentRecordId: student.id,
    studentId: student.studentId || "",
    studentName: student.name || personName(student),
    schoolYear:
      student.supervisorSchoolYear ||
      supervisor.schoolYear ||
      student.schoolYear ||
      "",
    company: student.company || supervisor.company || "",
    coordinatorUid: coordinator.uid,
    reason,
    ...(previousSupervisor?.id
      ? {
          previousSupervisorUid: previousSupervisor.id,
          previousSupervisorName: personName(previousSupervisor),
        }
      : {}),
    recordedAt: serverTimestamp(),
  };
}

async function syncStudentAccount(studentUid, changes) {
  if (!studentUid) return;
  try {
    await updateDoc(doc(db, "users", studentUid), changes);
    await syncStudentAccountProfile(studentUid, changes);
  } catch (error) {
    console.warn("Unable to sync supervisor assignment to the student account:", error);
  }
}

// Assigns (or reassigns) students to one supervisor. Each student keeps a single
// supervisorUid, so one supervisor can hold many students without duplicates.
export async function assignStudentsToSupervisor({
  coordinator,
  supervisor,
  studentIds,
  schoolYear = supervisor?.schoolYear || "",
  restoreSupervisor = false,
}) {
  const ids = [...new Set(studentIds || [])].filter(Boolean);
  if (!coordinator?.uid || coordinator.role !== "coordinator") {
    throw new Error("Only coordinators can assign students.");
  }
  if (!supervisor?.id || supervisor.role !== "supervisor") {
    throw new Error("Select a valid supervisor.");
  }
  if (
    !recordDepartmentId(coordinator) ||
    !sameDepartment(supervisor, coordinator)
  ) {
    throw new Error("You can only manage supervisors in your department.");
  }
  if (ids.length === 0) {
    throw new Error("Select at least one student.");
  }

  const supervisorName = personName(supervisor);
  const studentUids = [];
  const assignmentSchoolYear = schoolYear;

  await runTransaction(db, async (transaction) => {
    const supervisorRef = doc(db, "users", supervisor.id);
    const refs = ids.map((id) => doc(db, "students", id));
    const [supervisorSnapshot, ...snapshots] = await Promise.all([
      transaction.get(supervisorRef),
      ...refs.map((ref) => transaction.get(ref)),
    ]);
    if (
      !supervisorSnapshot.exists() ||
      supervisorSnapshot.data().role !== "supervisor" ||
      !sameDepartment(supervisorSnapshot.data(), coordinator)
    ) {
      throw new Error("You can only manage supervisors in your department.");
    }
    if (
      !restoreSupervisor &&
      (supervisorSnapshot.data().isArchived === true ||
        supervisorSnapshot.data().isActive === false)
    ) {
      throw new Error("Restore this supervisor before assigning students.");
    }
    snapshots.forEach((snapshot) => {
      if (!snapshot.exists()) throw new Error("A selected student no longer exists.");
      const student = snapshot.data();
      if (student.coordinatorUid !== coordinator.uid) {
        throw new Error("You can only assign students from your own roster.");
      }
      const currentAssignmentYear =
        student.supervisorSchoolYear ||
        (student.supervisorUid === supervisor.id
          ? supervisorSnapshot.data().schoolYear
          : "") ||
        student.schoolYear;
      if (
        student.supervisorUid === supervisor.id &&
        (!schoolYear || currentAssignmentYear === schoolYear)
      ) {
        throw new Error(`${student.name || student.studentId || "A student"} is already assigned to this supervisor.`);
      }
      if (student.schoolYear && schoolYear && student.schoolYear !== schoolYear) {
        throw new Error(
          `${student.name || student.studentId || "A student"} is assigned to School Year ${student.schoolYear}.`,
        );
      }
    });

    const priorIds = [
      ...new Set(
        snapshots
          .map((snapshot) => snapshot.data().supervisorUid)
          .filter((id) => id && id !== supervisor.id),
      ),
    ];
    const priorSnapshots = await Promise.all(
      priorIds.map((id) => transaction.get(doc(db, "users", id))),
    );
    const priorSupervisors = new Map(
      priorIds.map((id, index) => [
        id,
        priorSnapshots[index].exists() &&
        sameDepartment(priorSnapshots[index].data(), coordinator)
          ? { id, ...priorSnapshots[index].data() }
          : null,
      ]),
    );

    if (restoreSupervisor) {
      transaction.update(supervisorRef, {
        isArchived: false,
        isActive: true,
        status: "ACTIVE",
        schoolYear,
        archivedAt: null,
        archivedBy: null,
        restoredAt: serverTimestamp(),
        restoredBy: coordinator.uid,
        updatedAt: serverTimestamp(),
      });
    } else if (schoolYear && supervisorSnapshot.data().schoolYear !== schoolYear) {
      transaction.update(supervisorRef, {
        schoolYear,
        updatedAt: serverTimestamp(),
      });
    }

    snapshots.forEach((snapshot, index) => {
      const student = { id: ids[index], ...snapshot.data() };
      const priorId = student.supervisorUid;
      const priorSupervisor = priorId && priorSupervisors.get(priorId);
      const previousAssignmentYear =
        student.supervisorSchoolYear ||
        (priorId === supervisor.id
          ? supervisorSnapshot.data().schoolYear
          : priorSupervisor?.schoolYear) ||
        student.schoolYear;
      const isReassignment =
        priorId &&
        priorId !== supervisor.id
          ? true
          : priorId === supervisor.id &&
            schoolYear &&
            previousAssignmentYear !== schoolYear;
      transaction.set(
        doc(
          collection(
            db,
            "users",
            supervisor.id,
            "supervisorAssignmentHistory",
          ),
        ),
        historyEntry(
          { ...supervisorSnapshot.data(), id: supervisor.id, schoolYear },
          student,
          coordinator,
          isReassignment ? "reassigned" : "assigned",
          isReassignment
            ? priorSupervisor || { id: priorId, name: student.supervisorName }
            : null,
        ),
      );
      if (priorSupervisor && priorId !== supervisor.id) {
        transaction.set(
          doc(
            collection(
              db,
              "users",
              priorId,
              "supervisorAssignmentHistory",
            ),
          ),
          historyEntry(priorSupervisor, student, coordinator, "reassigned"),
        );
      }
      studentUids.push(snapshot.data().studentUid || null);
      transaction.update(refs[index], {
        supervisorUid: supervisor.id,
        supervisorName,
        supervisorSchoolYear: schoolYear || snapshot.data().schoolYear || "",
        ...(supervisor.company ? { company: supervisor.company } : {}),
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
        supervisorSchoolYear: assignmentSchoolYear,
        updatedAt: serverTimestamp(),
      }),
    ),
  );
  return ids.length;
}

export async function archiveSupervisor({
  coordinator,
  supervisor,
  students,
  schoolYear,
}) {
  if (!coordinator?.uid || coordinator.role !== "coordinator") {
    throw new Error("Only coordinators can archive supervisors.");
  }
  if (
    !supervisor?.id ||
    supervisor.role !== "supervisor" ||
    !sameDepartment(supervisor, coordinator)
  ) {
    throw new Error("You can only manage supervisors in your department.");
  }

  const assignedStudents = (students || []).filter(
    (student) => student.supervisorUid === supervisor.id,
  );
  const historyRefs = assignedStudents.map(() =>
    doc(
      collection(
        db,
        "users",
        supervisor.id,
        "supervisorAssignmentHistory",
      ),
    ),
  );

  await runTransaction(db, async (transaction) => {
    const supervisorRef = doc(db, "users", supervisor.id);
    const studentRefs = assignedStudents.map((student) =>
      doc(db, "students", student.id),
    );
    const [supervisorSnapshot, ...studentSnapshots] = await Promise.all([
      transaction.get(supervisorRef),
      ...studentRefs.map((studentRef) => transaction.get(studentRef)),
    ]);
    if (
      !supervisorSnapshot.exists() ||
      supervisorSnapshot.data().role !== "supervisor" ||
      !sameDepartment(supervisorSnapshot.data(), coordinator)
    ) {
      throw new Error("You can only manage supervisors in your department.");
    }
    if (supervisorSnapshot.data().isArchived === true) {
      throw new Error("This supervisor is already archived.");
    }

    studentSnapshots.forEach((snapshot, index) => {
      if (
        snapshot.exists() &&
        snapshot.data().coordinatorUid === coordinator.uid &&
        snapshot.data().supervisorUid === supervisor.id
      ) {
        const assignedSchoolYear =
          snapshot.data().supervisorSchoolYear ||
          supervisorSnapshot.data().schoolYear ||
          snapshot.data().schoolYear ||
          schoolYear ||
          "";
        transaction.set(
          historyRefs[index],
          historyEntry(
            {
              ...supervisorSnapshot.data(),
              id: supervisor.id,
              schoolYear: assignedSchoolYear,
            },
            { id: assignedStudents[index].id, ...snapshot.data() },
            coordinator,
            "school-year-archived",
          ),
        );
        if (!snapshot.data().supervisorSchoolYear) {
          transaction.update(studentRefs[index], {
            supervisorSchoolYear: assignedSchoolYear,
            updatedAt: serverTimestamp(),
          });
        }
      }
    });
    transaction.update(supervisorRef, {
      isArchived: true,
      isActive: false,
      status: "ARCHIVED",
      archivedAt: serverTimestamp(),
      archivedBy: coordinator.uid,
      archivedSchoolYear:
        supervisorSnapshot.data().schoolYear || schoolYear || "",
      updatedAt: serverTimestamp(),
    });
  });
}

export async function restoreSupervisor({
  coordinator,
  supervisor,
  schoolYear,
  students = [],
}) {
  if (!coordinator?.uid || coordinator.role !== "coordinator") {
    throw new Error("Only coordinators can restore supervisors.");
  }
  if (
    !supervisor?.id ||
    supervisor.role !== "supervisor" ||
    !sameDepartment(supervisor, coordinator)
  ) {
    throw new Error("You can only manage supervisors in your department.");
  }

  const assignedStudents = students.filter(
    (student) => student.supervisorUid === supervisor.id,
  );
  const historyRefs = assignedStudents.map(() =>
    doc(
      collection(
        db,
        "users",
        supervisor.id,
        "supervisorAssignmentHistory",
      ),
    ),
  );

  await runTransaction(db, async (transaction) => {
    const supervisorRef = doc(db, "users", supervisor.id);
    const studentRefs = assignedStudents.map((student) =>
      doc(db, "students", student.id),
    );
    const [snapshot, ...studentSnapshots] = await Promise.all([
      transaction.get(supervisorRef),
      ...studentRefs.map((studentRef) => transaction.get(studentRef)),
    ]);
    if (
      !snapshot.exists() ||
      snapshot.data().role !== "supervisor" ||
      !sameDepartment(snapshot.data(), coordinator)
    ) {
      throw new Error("You can only manage supervisors in your department.");
    }
    if (
      snapshot.data().isArchived !== true &&
      String(snapshot.data().status || "").toUpperCase() !== "ARCHIVED"
    ) {
      throw new Error("This supervisor is not archived.");
    }
    studentSnapshots.forEach((studentSnapshot, index) => {
      if (
        studentSnapshot.exists() &&
        studentSnapshot.data().coordinatorUid === coordinator.uid &&
        studentSnapshot.data().supervisorUid === supervisor.id &&
        !studentSnapshot.data().supervisorSchoolYear
      ) {
        const assignedSchoolYear =
          snapshot.data().schoolYear ||
          studentSnapshot.data().schoolYear ||
          schoolYear ||
          "";
        transaction.set(
          historyRefs[index],
          historyEntry(
            { id: supervisor.id, ...snapshot.data(), schoolYear: assignedSchoolYear },
            { id: assignedStudents[index].id, ...studentSnapshot.data() },
            coordinator,
            "school-year-archived",
          ),
        );
        transaction.update(studentRefs[index], {
          supervisorSchoolYear: assignedSchoolYear,
          updatedAt: serverTimestamp(),
        });
      }
    });
    transaction.update(supervisorRef, {
      isArchived: false,
      isActive: true,
      status: "ACTIVE",
      schoolYear,
      archivedAt: null,
      archivedBy: null,
      restoredAt: serverTimestamp(),
      restoredBy: coordinator.uid,
      updatedAt: serverTimestamp(),
    });
  });
}

// Removes one student from their supervisor without touching the supervisor account.
export async function unassignStudent({ coordinator, student }) {
  if (!coordinator?.uid || student?.coordinatorUid !== coordinator.uid) {
    throw new Error("You can only change students on your own roster.");
  }
  const studentRef = doc(db, "students", student.id);
  const historyRef = student.supervisorUid
    ? doc(
        collection(
          db,
          "users",
          student.supervisorUid,
          "supervisorAssignmentHistory",
        ),
      )
    : null;
  const changes = {
    supervisorUid: deleteField(),
    supervisorName: deleteField(),
    supervisorSchoolYear: deleteField(),
    updatedAt: serverTimestamp(),
  };
  await runTransaction(db, async (transaction) => {
    const studentSnapshot = await transaction.get(studentRef);
    if (
      !studentSnapshot.exists() ||
      studentSnapshot.data().coordinatorUid !== coordinator.uid
    ) {
      throw new Error("You can only change students on your own roster.");
    }
    if (historyRef) {
      const supervisorRef = doc(db, "users", student.supervisorUid);
      const supervisorSnapshot = await transaction.get(supervisorRef);
      if (supervisorSnapshot.exists()) {
        transaction.set(
          historyRef,
          historyEntry(
            { id: student.supervisorUid, ...supervisorSnapshot.data() },
            { id: student.id, ...studentSnapshot.data() },
            coordinator,
            "unassigned",
          ),
        );
      }
    }
    transaction.update(studentRef, changes);
  });
  await syncStudentAccount(student.studentUid, changes);
}
