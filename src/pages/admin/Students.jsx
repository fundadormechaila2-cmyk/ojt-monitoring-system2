import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { Archive, ArchiveRestore, Eye, KeyRound, Plus, Search, Trash2, X } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { COURSES } from "../../constants/courses";
import {
  departmentIdFor,
  departmentLabel,
  recordDepartmentId,
  studentDepartmentFields,
} from "../../constants/departments";
import { db } from "../../services/firebase";
import { createManagedUser } from "../../services/userManagementSevice";
import AccountActionDialog from "../../components/AccountActionDialog";
import { normalizedStudents } from "../coordinator/coordinatorData";
import "./Students.css";

const avatarColors = ["blue", "green", "purple", "orange", "teal", "slate"];

// Stops the form from staying disabled forever if the network or Firebase never responds.
const withTimeout = (promise, label, ms = 30000) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} timed out. Check your internet connection and try again.`)),
        ms,
      ),
    ),
  ]);
const emptyNewStudent = {
  firstName: "",
  lastName: "",
  studentId: "",
  email: "",
  phone: "",
  course: "",
  company: "",
  coordinatorUid: "",
  requiredHours: "486",
};

function splitName(student) {
  const fullName = String(student.name || "").trim().split(/\s+/);
  return {
    firstName: student.firstName || fullName.shift() || "",
    lastName: student.lastName || fullName.join(" "),
  };
}

function findCoordinatorForCourse(course, userList) {
  const departmentId = departmentIdFor(course);
  if (!departmentId || !userList?.length) return null;
  return (
    userList.find(
      (account) =>
        account.role === "coordinator" &&
        account.isArchived !== true &&
        account.isActive !== false &&
        recordDepartmentId(account) === departmentId,
    ) || null
  );
}

function coordinatorMatchesCourse(coordinator, course) {
  const departmentId = departmentIdFor(course);
  return Boolean(departmentId) && recordDepartmentId(coordinator) === departmentId;
}

function coordinatorDisplayName(coordinator) {
  if (!coordinator) return "";
  return (
    `${coordinator.firstName || ""} ${coordinator.lastName || ""}`.trim() ||
    coordinator.fullName ||
    coordinator.displayName ||
    coordinator.email ||
    ""
  );
}

function accountForStudent(student, users) {
  const studentId = String(student.studentId || "").trim().toLowerCase();
  const email = String(student.email || "").trim().toLowerCase();

  return users.find((account) => {
    if (account.role !== "student") return false;
    return (
      account.id === student.studentUid ||
      account.id === student.userUid ||
      account.id === student.accountUid ||
      account.studentRecordId === student.id ||
      (studentId &&
        String(account.studentId || "").trim().toLowerCase() === studentId) ||
      (email && String(account.email || "").trim().toLowerCase() === email)
    );
  });
}

function Students() {
  const { user } = useAuth();
  const [students, setStudents] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sourceErrors, setSourceErrors] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [courseFilter, setCourseFilter] = useState("All courses");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [coordinatorAssignment, setCoordinatorAssignment] = useState("");
  const [accountStudent, setAccountStudent] = useState(null);
  const [addingStudent, setAddingStudent] = useState(false);
  const [newStudent, setNewStudent] = useState(emptyNewStudent);
  const [accountForm, setAccountForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
  });
  const [saving, setSaving] = useState(false);
  const [accountAction, setAccountAction] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    const snapshots = { students: false, users: false };
    const updateLoading = () => {
      if (snapshots.students && snapshots.users) setLoading(false);
    };
    const unsubscribeStudents = onSnapshot(
      collection(db, "students"),
      (snapshot) => {
        setStudents(
          snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
        );
        snapshots.students = true;
        setSourceErrors((current) => {
          const next = { ...current };
          delete next.students;
          return next;
        });
        updateLoading();
      },
      (snapshotError) => {
        console.error("Unable to load enrolled students:", snapshotError);
        snapshots.students = true;
        setSourceErrors((current) => ({
          ...current,
          students: "Enrolled student records could not be loaded.",
        }));
        updateLoading();
      },
    );
    const unsubscribeUsers = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        setUsers(
          snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
        );
        snapshots.users = true;
        setSourceErrors((current) => {
          const next = { ...current };
          delete next.users;
          return next;
        });
        updateLoading();
      },
      (snapshotError) => {
        console.error("Unable to load student accounts:", snapshotError);
        snapshots.users = true;
        setSourceErrors((current) => ({
          ...current,
          users: "Student accounts could not be checked. Account creation is disabled.",
        }));
        updateLoading();
      },
    );

    return () => {
      unsubscribeStudents();
      unsubscribeUsers();
    };
  }, []);

  const records = useMemo(() => normalizedStudents(students, []), [students]);
  const courses = useMemo(
    () =>
      [...new Set([...COURSES, ...records.map((student) => student.course)])]
        .filter(Boolean)
        .sort(),
    [records],
  );
  const filteredStudents = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return records.filter((student) => {
      const account = accountForStudent(student, users);
      return (
        (!query ||
          `${student.name} ${student.studentId} ${student.course} ${student.email || ""}`
            .toLowerCase()
            .includes(query)) &&
        (courseFilter === "All courses" || student.course === courseFilter) &&
        (statusFilter === "Archived"
          ? student.isArchived === true
          : student.isArchived !== true) &&
        (["All statuses", "No account", "Archived"].includes(statusFilter) ||
          student.status === statusFilter) &&
        (statusFilter !== "No account" || !account)
      );
    });
  }, [courseFilter, records, searchTerm, statusFilter, users]);
  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
  const visibleStudents = filteredStudents.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );
  const accountCount = records.filter((student) =>
    student.isArchived !== true && accountForStudent(student, users),
  ).length;
  const counts = records.filter((student) => student.isArchived !== true).reduce(
    (result, student) => {
      result[student.status] = (result[student.status] || 0) + 1;
      return result;
    },
    { DEPLOYED: 0, PROCESSING: 0, COMPLETED: 0 },
  );

  const coordinators = useMemo(
    () => users.filter((account) => account.role === "coordinator" && account.isArchived !== true && account.isActive !== false),
    [users],
  );

  const autoMatchedCoordinator = useMemo(
    () => findCoordinatorForCourse(newStudent.course, users),
    [newStudent.course, users],
  );

  const unassignedMatchingStudents = useMemo(() => {
    return students.filter((s) => {
      if (s.coordinatorUid || s.isArchived === true) return false;
      return Boolean(findCoordinatorForCourse(s.course, users));
    });
  }, [students, users]);

  const [batchAssigning, setBatchAssigning] = useState(false);

  const autoAssignAllUnassigned = async () => {
    if (!unassignedMatchingStudents.length) return;
    setBatchAssigning(true);
    setError("");
    try {
      const batch = writeBatch(db);
      let count = 0;
      for (const student of unassignedMatchingStudents) {
        const coord = findCoordinatorForCourse(student.course, users);
        if (coord) {
          const coordName = coordinatorDisplayName(coord);
          const studentUpdate = {
            coordinatorUid: coord.id,
            coordinatorName: coordName,
            ...studentDepartmentFields(student.course),
            updatedAt: serverTimestamp(),
          };
          batch.update(doc(db, "students", student.id), studentUpdate);
          const account = accountForStudent(student, users);
          if (account) {
            batch.update(doc(db, "users", account.id), studentUpdate);
          }
          count += 1;
        }
      }
      await batch.commit();
      setNotice(`Auto-assigned ${count} student(s) to their department coordinator.`);
      window.setTimeout(() => setNotice(""), 6000);
    } catch (assignError) {
      console.error("Unable to auto-assign students:", assignError);
      setError(`Auto-assignment could not be completed: ${assignError.message}`);
    } finally {
      setBatchAssigning(false);
    }
  };

  const handleNewStudentCourseChange = (selectedCourse) => {
    const matched = findCoordinatorForCourse(selectedCourse, users);
    setNewStudent((current) => ({
      ...current,
      course: selectedCourse,
      coordinatorUid: matched ? matched.id : current.coordinatorUid,
    }));
  };

  const updateFilter = (setter, value) => {
    setter(value);
    setPage(1);
  };

  const openAccountForm = (student) => {
    const { firstName, lastName } = splitName(student);
    setAccountStudent(student);
    setAccountForm({
      firstName,
      lastName,
      email: student.email || student.emailAddress || "",
    });
    setError("");
  };

  const openStudentDetails = (student) => {
    const account = accountForStudent(student, users);
    setSelectedStudent(student);
    const existing = student.coordinatorUid || account?.coordinatorUid || "";
    if (!existing && student.course) {
      const matched = findCoordinatorForCourse(student.course, users);
      setCoordinatorAssignment(matched ? matched.id : "");
    } else {
      setCoordinatorAssignment(existing);
    }
    setError("");
  };

  const saveCoordinatorAssignment = async () => {
    if (!selectedStudent) return;

    const account = accountForStudent(selectedStudent, users);
    const studentUid = selectedStudent.studentUid || account?.id;
    const selectedCoordinator = users.find((u) => u.id === coordinatorAssignment);
    const coordinatorName = coordinatorDisplayName(selectedCoordinator);
    const assignment = coordinatorAssignment
      ? {
          coordinatorUid: coordinatorAssignment,
          ...(coordinatorName ? { coordinatorName } : {}),
        }
      : {
          coordinatorUid: deleteField(),
          coordinatorName: deleteField(),
        };
    const departmentUpdate = studentDepartmentFields(selectedStudent.course);
    const studentUpdate = {
      ...assignment,
      ...departmentUpdate,
      updatedAt: serverTimestamp(),
    };

    setSaving(true);
    setError("");
    try {
      const assignmentBatch = writeBatch(db);
      assignmentBatch.update(
        doc(db, "students", selectedStudent.id),
        studentUpdate,
      );
      if (account) {
        assignmentBatch.update(doc(db, "users", account.id), {
          ...assignment,
          ...departmentUpdate,
          updatedAt: serverTimestamp(),
        });
      }
      await assignmentBatch.commit();

      const attendanceQueries = await Promise.all([
        ...(studentUid
          ? [
              getDocs(
                query(
                  collection(db, "attendance"),
                  where("studentUid", "==", studentUid),
                ),
              ),
            ]
          : []),
        ...(selectedStudent.studentId
          ? [
              getDocs(
                query(
                  collection(db, "attendance"),
                  where("studentId", "==", String(selectedStudent.studentId)),
                ),
              ),
            ]
          : []),
      ]);
      const attendanceRecords = new Map();
      attendanceQueries.forEach((snapshot) => {
        snapshot.docs.forEach((record) => {
          const recordUid = record.data().studentUid;
          if (!studentUid || !recordUid || recordUid === studentUid) {
            attendanceRecords.set(record.id, record);
          }
        });
      });
      const records = [...attendanceRecords.values()];

      const updateRecords = async (recordReferences) => {
        for (let offset = 0; offset < recordReferences.length; offset += 450) {
          const batch = writeBatch(db);
          recordReferences.slice(offset, offset + 450).forEach((record) => {
            batch.update(record.ref, assignment);
          });
          await batch.commit();
        }
      };
      await updateRecords(records);

      let signInsUpdated = 0;
      if (studentUid) {
        const loginSnapshot = await getDocs(
          query(
            collection(db, "studentLoginActivity"),
            where("userId", "==", studentUid),
          ),
        );
        signInsUpdated = loginSnapshot.size;
        await updateRecords(loginSnapshot.docs);
      }

      setNotice(
        coordinatorAssignment
          ? `Coordinator assignment saved. ${records.length} attendance record${records.length === 1 ? "" : "s"} and ${signInsUpdated} sign-in record${signInsUpdated === 1 ? "" : "s"} updated.`
          : `Coordinator assignment removed. ${records.length} attendance record${records.length === 1 ? "" : "s"} and ${signInsUpdated} sign-in record${signInsUpdated === 1 ? "" : "s"} updated.`,
      );
      setSelectedStudent(null);
      window.setTimeout(() => setNotice(""), 5000);
    } catch (saveError) {
      console.error("Unable to save coordinator assignment:", saveError);
      const errorCode = String(saveError?.code || "");
      setError(errorCode.includes("permission-denied")
        ? "Firestore denied this update. Publish the latest Firestore rules and confirm your user profile has the admin role."
        : `The coordinator assignment could not be fully saved. ${saveError.message || "Check your connection and try again."}`);
    } finally {
      setSaving(false);
    }
  };

  const createStudentAccount = async (event) => {
    event.preventDefault();
    if (!accountStudent) return;
    if (sourceErrors.users) {
      setError("Student accounts could not be checked. Reload the page and try again.");
      return;
    }
    if (accountForStudent(accountStudent, users)) {
      setError("This student already has a linked login account.");
      return;
    }

    setSaving(true);
    setError("");
    let managedUser;
    try {
      const autoCoord = findCoordinatorForCourse(accountStudent.course, users);
      const coordUid = accountStudent.coordinatorUid || autoCoord?.id || "";
      const coordObj = users.find((u) => u.id === coordUid);
      const coordName = coordinatorDisplayName(coordObj);

      managedUser = await createManagedUser({
        firstName: accountForm.firstName,
        lastName: accountForm.lastName,
        email: accountForm.email,
        role: "student",
        createdBy: user?.uid || null,
        studentId: accountStudent.studentId || "",
        studentRecordId: accountStudent.id,
        course: accountStudent.course || "",
        company: accountStudent.company || "",
        coordinatorUid: coordUid,
        coordinatorName: coordName,
      });

      await updateDoc(doc(db, "students", accountStudent.id), {
        studentUid: managedUser.uid,
        accountEmail: accountForm.email.trim(),
        ...studentDepartmentFields(accountStudent.course),
        ...(coordUid && !accountStudent.coordinatorUid ? { coordinatorUid: coordUid } : {}),
        ...(coordName && !accountStudent.coordinatorName ? { coordinatorName: coordName } : {}),
        updatedAt: serverTimestamp(),
      });

      setNotice(`Login account created for ${accountStudent.name}.`);
      window.alert(
        `Account created for ${accountStudent.name}.\n\nEmail: ${managedUser.email}\nTemporary password: ${managedUser.temporaryPassword}`,
      );
      setAccountStudent(null);
    } catch (saveError) {
      console.error("Unable to create or link student account:", saveError);
      setError(
        managedUser
          ? `The login was created, but its student record could not be fully linked. Give the student their temporary password and retry linking after checking Firestore. ${saveError.message}`
          : saveError.message || "Unable to create the student account.",
      );
      if (managedUser) {
        window.alert(
          `The login account was created for ${accountStudent.name}, but the student record could not be fully linked.\n\nEmail: ${managedUser.email}\nTemporary password: ${managedUser.temporaryPassword}\n\n${saveError.message}`,
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const createStudentAndAccount = async (event) => {
    event.preventDefault();
    if (sourceErrors.users) {
      setError("Student accounts could not be checked. Reload the page and try again.");
      return;
    }

    const studentId = newStudent.studentId.trim();
    const email = newStudent.email.trim();
    const normalizedEmail = email.toLowerCase();
    if (
      studentId &&
      records.some(
        (student) =>
          String(student.studentId || "").trim().toLowerCase() ===
          studentId.toLowerCase(),
      )
    ) {
      setError("A student with this student ID already exists.");
      return;
    }
    if (
      users.some(
        (account) => String(account.email || "").trim().toLowerCase() === normalizedEmail,
      )
    ) {
      setError("An account with this email address already exists.");
      return;
    }

    setSaving(true);
    setError("");
    let studentReference;
    let managedUser;
    const name = `${newStudent.firstName.trim()} ${newStudent.lastName.trim()}`;
    const requiredHours = Number(newStudent.requiredHours);

    const autoCoordinator = findCoordinatorForCourse(newStudent.course, users);
    const targetCoordinatorUid =
      newStudent.coordinatorUid || autoCoordinator?.id || "";
    const targetCoordinator = users.find((u) => u.id === targetCoordinatorUid);
    const targetCoordinatorName = coordinatorDisplayName(targetCoordinator);

    try {
      studentReference = await withTimeout(addDoc(collection(db, "students"), {
        name,
        firstName: newStudent.firstName.trim(),
        lastName: newStudent.lastName.trim(),
        studentId,
        email,
        phone: newStudent.phone.trim(),
        course: newStudent.course,
        ...studentDepartmentFields(newStudent.course),
        company: newStudent.company.trim(),
        ...(targetCoordinatorUid
          ? { coordinatorUid: targetCoordinatorUid }
          : {}),
        ...(targetCoordinatorName
          ? { coordinatorName: targetCoordinatorName }
          : {}),
        requiredHours,
        completedHours: 0,
        ojtStatus: "PROCESSING",
        createdBy: user?.uid || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }), "Saving the student record");

      managedUser = await withTimeout(createManagedUser({
        firstName: newStudent.firstName,
        lastName: newStudent.lastName,
        email,
        phone: newStudent.phone,
        role: "student",
        createdBy: user?.uid || null,
        studentId,
        studentRecordId: studentReference.id,
        course: newStudent.course,
        company: newStudent.company,
        coordinatorUid: targetCoordinatorUid,
        coordinatorName: targetCoordinatorName,
      }), "Creating the login account");

      await updateDoc(doc(db, "students", studentReference.id), {
        studentUid: managedUser.uid,
        accountEmail: email,
        updatedAt: serverTimestamp(),
      });

      setNotice(`Student and login account created for ${name}.`);
      window.alert(
        `Student and account created.\n\nName: ${name}\nEmail: ${managedUser.email}\nTemporary password: ${managedUser.temporaryPassword}`,
      );
      setAddingStudent(false);
      setNewStudent(emptyNewStudent);
    } catch (saveError) {
      console.error("Unable to create student and login account:", saveError);
      const partialMessage = managedUser
        ? `The account was created but the student record could not be fully linked. Email: ${managedUser.email}. Temporary password: ${managedUser.temporaryPassword}.`
        : studentReference
          ? "The student roster record was saved, but the login account could not be created. You can create the account from this student's row."
          : "";
      setError(
        [saveError.message || "Unable to create student.", partialMessage]
          .filter(Boolean)
          .join(" "),
      );
      if (managedUser) {
        window.alert(
          `The account was created but linking did not complete.\n\nEmail: ${managedUser.email}\nTemporary password: ${managedUser.temporaryPassword}\n\n${saveError.message}`,
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const openAccountAction = (action, student, account) => setAccountAction({
    action,
    target: {
      type: "student",
      id: student.id,
      name: student.name,
      email: account?.email || student.email || student.accountEmail || "",
      role: "student",
    },
  });

  const finishAccountAction = (message, warnings) => {
    setAccountAction(null);
    setError("");
    setNotice([message, ...warnings].join(" "));
    window.setTimeout(() => setNotice(""), 5000);
  };

  const clearFilters = () => {
    setSearchTerm("");
    setCourseFilter("All courses");
    setStatusFilter("All statuses");
    setPage(1);
  };

  if (loading) {
    return <main className="students-page students-state">Loading enrolled students...</main>;
  }

  return (
    <main className="students-page">
      <header className="students-header">
        <div>
          <p className="students-eyebrow">OJT management</p>
          <h1>Enrolled Students</h1>
          <p className="students-subtitle">
            Create accounts for students ready to take practicum or internship.
            The coordinator roster uses these same live student records.
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          {unassignedMatchingStudents.length > 0 && (
            <button
              type="button"
              className="students-secondary"
              disabled={batchAssigning}
              onClick={autoAssignAllUnassigned}
              title={`Automatically link ${unassignedMatchingStudents.length} student(s) to their department coordinator`}
            >
              {batchAssigning ? "Assigning..." : `Auto-Assign Coordinators (${unassignedMatchingStudents.length})`}
            </button>
          )}
          <button
            type="button"
            className="students-primary"
            disabled={Boolean(sourceErrors.users)}
            onClick={() => {
              setNewStudent(emptyNewStudent);
              setError("");
              setSaving(false);
              setAddingStudent(true);
            }}
          >
            <Plus size={16} /> Add Student
          </button>
        </div>
      </header>

      {(error || Object.values(sourceErrors).length > 0) && (
        <div className="students-error" role="alert">
          {error || Object.values(sourceErrors).join(" ")}
        </div>
      )}

      <section className="students-summary" aria-label="Student account summary">
        <article className="students-stat">
          <span className="students-stat-icon blue"><Search size={19} /></span>
          <div><p>Enrolled Students</p><strong>{records.length}</strong></div>
        </article>
        <article className="students-stat">
          <span className="students-stat-icon green"><KeyRound size={19} /></span>
          <div><p>Accounts Created</p><strong>{accountCount}</strong></div>
        </article>
        <article className="students-stat">
          <span className="students-stat-icon amber"><KeyRound size={19} /></span>
          <div><p>No Account Yet</p><strong>{records.length - accountCount}</strong></div>
        </article>
        <article className="students-stat">
          <span className="students-stat-icon indigo"><Eye size={19} /></span>
          <div><p>On Practicum / Internship</p><strong>{counts.DEPLOYED}</strong></div>
        </article>
      </section>

      <section className="students-panel">
        <div className="students-toolbar">
          <label className="students-search">
            <Search size={17} />
            <span className="sr-only">Search enrolled students</span>
            <input
              placeholder="Search name, student ID, email, or course"
              value={searchTerm}
              onChange={(event) => updateFilter(setSearchTerm, event.target.value)}
            />
          </label>
          <div className="students-filters">
            <select
              className="students-select"
              aria-label="Filter by course"
              value={courseFilter}
              onChange={(event) => updateFilter(setCourseFilter, event.target.value)}
            >
              <option>All courses</option>
              {courses.map((course) => <option key={course}>{course}</option>)}
            </select>
            <select
              className="students-select"
              aria-label="Filter by student status"
              value={statusFilter}
              onChange={(event) => updateFilter(setStatusFilter, event.target.value)}
            >
              <option>All statuses</option>
              <option>DEPLOYED</option>
              <option>PROCESSING</option>
              <option>COMPLETED</option>
              <option>No account</option>
              <option>Archived</option>
            </select>
          </div>
        </div>

        <div className="students-table-wrap">
          <table className="students-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Student ID</th>
                <th>Course</th>
                <th>OJT Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleStudents.map((student, index) => {
                const account = accountForStudent(student, users);
                const statusClass = student.status.toLowerCase();
                return (
                  <tr key={student.id}>
                    <td>
                      <div className="student-profile">
                        <span className={`student-avatar ${avatarColors[index % avatarColors.length]}`}>
                          {student.name.split(/\s+/).map((part) => part[0]).join("")}
                        </span>
                        <div>
                          <strong>{student.name}</strong>
                          <span>{student.email || student.accountEmail || "Email not provided"}</span>
                        </div>
                      </div>
                    </td>
                    <td><span className="student-id">{student.studentId || "—"}</span></td>
                    <td>{student.course}</td>
                    <td><span className={`student-status ${statusClass}`}>{student.status}</span></td>
                    <td>
                      <div className="student-actions">
                        <button
                          type="button"
                          className="student-action"
                          title="View student"
                          aria-label={`View ${student.name}`}
                          onClick={() => openStudentDetails(student)}
                        >
                          <Eye size={15} />
                        </button>
                        {student.isArchived === true ? (
                          <button
                            type="button"
                            className="student-action"
                            title="Restore student"
                            aria-label={`Restore ${student.name}`}
                            onClick={() => openAccountAction("restore", student, account)}
                          >
                            <ArchiveRestore size={15} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="student-action"
                            title="Archive student"
                            aria-label={`Archive ${student.name}`}
                            onClick={() => openAccountAction("archive", student, account)}
                          >
                            <Archive size={15} />
                          </button>
                        )}
                        <button
                          type="button"
                          className="student-action"
                          title="Delete permanently"
                          aria-label={`Delete ${student.name}`}
                          onClick={() => openAccountAction("delete", student, account)}
                        >
                          <Trash2 size={15} />
                        </button>
                        {!account && student.isArchived !== true && (
                          <button
                            type="button"
                            className="student-action"
                            title="Create student login"
                            aria-label={`Create login for ${student.name}`}
                            disabled={Boolean(sourceErrors.users)}
                            onClick={() => openAccountForm(student)}
                          >
                            <KeyRound size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visibleStudents.length === 0 && (
            <div className="students-empty">
              <Search size={24} />
              <strong>{sourceErrors.students ? "Student records unavailable" : "No students found"}</strong>
              <span>{sourceErrors.students || "Try changing your search or filters."}</span>
              {!sourceErrors.students && <button type="button" onClick={clearFilters}>Clear filters</button>}
            </div>
          )}
        </div>

        <footer className="students-footer">
          <span>
            Showing {filteredStudents.length ? (page - 1) * pageSize + 1 : 0}–
            {Math.min(page * pageSize, filteredStudents.length)} of {filteredStudents.length} students
          </span>
          <div className="student-pagination">
            <button
              type="button"
              className="student-page-button"
              aria-label="Previous page"
              disabled={page === 1}
              onClick={() => setPage((current) => current - 1)}
            >
              ‹
            </button>
            <button type="button" className="student-page-button current" aria-label="Current page" disabled>
              {page}
            </button>
            <button
              type="button"
              className="student-page-button"
              aria-label="Next page"
              disabled={page === totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              ›
            </button>
          </div>
        </footer>
      </section>

      {selectedStudent && (
        <div className="students-modal-backdrop" role="presentation" onClick={(event) => event.target === event.currentTarget && setSelectedStudent(null)}>
          <section className="students-modal" role="dialog" aria-modal="true" aria-labelledby="student-modal-title">
            <header className="students-modal-header">
              <div>
                <h2 id="student-modal-title">{selectedStudent.name}</h2>
                <p>{selectedStudent.studentId || "No student ID"} · {selectedStudent.course}</p>
              </div>
              <button type="button" className="students-modal-close" aria-label="Close student details" onClick={() => setSelectedStudent(null)}><X size={17} /></button>
            </header>
            <div className="students-modal-body">
              <div className="student-detail"><label>Contact email</label><strong>{selectedStudent.email || "Not provided"}</strong></div>
              <div className="student-detail"><label>OJT status</label><strong>{selectedStudent.status}</strong></div>
              <div className="student-detail"><label>Partner company</label><strong>{selectedStudent.company}</strong></div>
              <div className="student-detail"><label>Hours progress</label><strong>{selectedStudent.completed} of {selectedStudent.required} hours</strong></div>
              <label className="student-detail">
                <span>Assigned coordinator</span>
                <select
                  value={coordinatorAssignment}
                  disabled={saving}
                  onChange={(event) => setCoordinatorAssignment(event.target.value)}
                >
                  <option value="">Unassigned</option>
                  {coordinators.map((coordinator) => {
                    const isDeptMatch = coordinatorMatchesCourse(
                      coordinator,
                      selectedStudent.course,
                    );
                    return (
                      <option key={coordinator.id} value={coordinator.id}>
                        {coordinatorDisplayName(coordinator)}
                        {coordinator.department ? ` — ${departmentLabel(coordinator.department)}` : ""}
                        {isDeptMatch ? " ★ (Program match)" : ""}
                      </option>
                    );
                  })}
                </select>
              </label>
            </div>
            <footer className="students-modal-footer">
              <button
                type="button"
                className="students-primary"
                disabled={saving}
                onClick={saveCoordinatorAssignment}
              >
                {saving ? "Saving assignment..." : "Save coordinator"}
              </button>
            </footer>
          </section>
        </div>
      )}

      {accountStudent && (
        <div className="students-modal-backdrop" role="presentation" onClick={(event) => event.target === event.currentTarget && !saving && setAccountStudent(null)}>
          <section className="students-modal" role="dialog" aria-modal="true" aria-labelledby="account-modal-title">
            <header className="students-modal-header">
              <div>
                <h2 id="account-modal-title">Create student login</h2>
                <p>{accountStudent.name} · {accountStudent.studentId || accountStudent.course}</p>
              </div>
              <button type="button" className="students-modal-close" aria-label="Close account form" disabled={saving} onClick={() => setAccountStudent(null)}><X size={17} /></button>
            </header>
            <form className="students-account-form" onSubmit={createStudentAccount}>
              <label>First name<input required value={accountForm.firstName} onChange={(event) => setAccountForm((current) => ({ ...current, firstName: event.target.value }))} /></label>
              <label>Last name<input required value={accountForm.lastName} onChange={(event) => setAccountForm((current) => ({ ...current, lastName: event.target.value }))} /></label>
              <label>Email address<input type="email" required value={accountForm.email} onChange={(event) => setAccountForm((current) => ({ ...current, email: event.target.value }))} /></label>
              <p>A temporary password will be generated. The account will be linked to this enrolled student record.</p>
              {error && <div className="students-error" role="alert">{error}</div>}
              <footer>
                <button type="button" className="students-secondary" disabled={saving} onClick={() => setAccountStudent(null)}>Cancel</button>
                <button type="submit" className="students-primary" disabled={saving}>{saving ? "Creating account..." : "Create account"}</button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {addingStudent && (
        <div
          className="students-modal-backdrop"
          role="presentation"
          onClick={(event) =>
            event.target === event.currentTarget &&
            !saving &&
            setAddingStudent(false)
          }
        >
          <section
            className="students-modal students-add-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-student-title"
          >
            <header className="students-modal-header">
              <div>
                <h2 id="add-student-title">Add Student</h2>
                <p>Create an enrolled student record and login account.</p>
              </div>
              <button
                type="button"
                className="students-modal-close"
                aria-label="Close add student form"
                disabled={saving}
                onClick={() => setAddingStudent(false)}
              >
                <X size={17} />
              </button>
            </header>
            <form
              className="students-account-form students-add-form"
              onSubmit={createStudentAndAccount}
            >
              <label>
                First name
                <input
                  required
                  value={newStudent.firstName}
                  onChange={(event) =>
                    setNewStudent((current) => ({
                      ...current,
                      firstName: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Last name
                <input
                  required
                  value={newStudent.lastName}
                  onChange={(event) =>
                    setNewStudent((current) => ({
                      ...current,
                      lastName: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Student ID
                <input
                  required
                  value={newStudent.studentId}
                  onChange={(event) =>
                    setNewStudent((current) => ({
                      ...current,
                      studentId: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Email address
                <input
                  type="email"
                  required
                  value={newStudent.email}
                  onChange={(event) =>
                    setNewStudent((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Phone
                <input
                  type="tel"
                  value={newStudent.phone}
                  onChange={(event) =>
                    setNewStudent((current) => ({
                      ...current,
                      phone: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Course / Program
                <select
                  required
                  value={newStudent.course}
                  onChange={(event) =>
                    handleNewStudentCourseChange(event.target.value)
                  }
                >
                  <option value="">Select a course</option>
                  {COURSES.map((course) => (
                    <option key={course} value={course}>
                      {course}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Partner company
                <input
                  value={newStudent.company}
                  onChange={(event) =>
                    setNewStudent((current) => ({
                      ...current,
                      company: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Assigned coordinator
                <select
                  value={newStudent.coordinatorUid}
                  onChange={(event) =>
                    setNewStudent((current) => ({
                      ...current,
                      coordinatorUid: event.target.value,
                    }))
                  }
                >
                  <option value="">
                    {autoMatchedCoordinator
                      ? `Auto-selected: ${coordinatorDisplayName(autoMatchedCoordinator)}`
                      : "Select a coordinator (optional)"}
                  </option>
                  {coordinators.map((coordinator) => {
                    const isAuto = autoMatchedCoordinator?.id === coordinator.id;
                    return (
                      <option key={coordinator.id} value={coordinator.id}>
                        {coordinatorDisplayName(coordinator)}
                        {coordinator.department ? ` — ${departmentLabel(coordinator.department)}` : ""}
                        {isAuto ? " (Auto-matched)" : ""}
                      </option>
                    );
                  })}
                </select>
                {autoMatchedCoordinator && (
                  <span style={{ fontSize: "11px", color: "#16866f", fontWeight: "normal" }}>
                    ✓ Auto-assigned to {coordinatorDisplayName(autoMatchedCoordinator)} based on program
                  </span>
                )}
              </label>
              <label>
                Required OJT hours
                <input
                  type="number"
                  min="1"
                  required
                  value={newStudent.requiredHours}
                  onChange={(event) =>
                    setNewStudent((current) => ({
                      ...current,
                      requiredHours: event.target.value,
                    }))
                  }
                />
              </label>
              <p>
                A temporary password will be generated. The student will appear
                on the coordinator roster automatically.
              </p>
              {error && (
                <div className="students-error" role="alert" style={{ gridColumn: "1 / -1" }}>
                  {error}
                </div>
              )}
              <footer>
                <button
                  type="button"
                  className="students-secondary"
                  disabled={saving}
                  onClick={() => setAddingStudent(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="students-primary"
                  disabled={saving}
                >
                  {saving ? "Creating student..." : "Create student & account"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {accountAction && <AccountActionDialog {...accountAction} onClose={() => setAccountAction(null)} onDone={finishAccountAction} />}
      {notice && <div className="students-notice" role="status">{notice}</div>}
    </main>
  );
}

export default Students;
