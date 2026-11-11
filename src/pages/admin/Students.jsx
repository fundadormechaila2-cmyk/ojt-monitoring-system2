import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  Eye,
  KeyRound,
  Mail,
  Pencil,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { COURSES } from "../../constants/courses";
import {
  departmentIdFor,
  departmentLabel,
  recordDepartmentId,
  studentDepartmentFields,
} from "../../constants/departments";
import { db } from "../../services/firebase";
import { isAccountLive } from "../../services/recordState";
import { studentAccountRef } from "../../services/studentAccountService";
import {
  createManagedUser,
  resendStudentAccountNotification,
} from "../../services/userManagementSevice";
import DepartmentBadge from "../../components/DepartmentBadge";
import { normalizedStudents } from "../coordinator/coordinatorData";
import "./Students.css";

const avatarColors = ["blue", "green", "purple", "orange", "teal", "slate"];

// Stops the form from staying disabled forever if the network or Firebase never responds.
const withTimeout = (promise, label, ms = 30000) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `${label} timed out. Check your internet connection and try again.`,
            ),
          ),
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
  schoolYear: "",
  company: "",
  coordinatorUid: "",
  requiredHours: "486",
};

function splitName(student) {
  const fullName = String(student.name || "")
    .trim()
    .split(/\s+/);
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
  const studentId = String(student.studentId || "")
    .trim()
    .toLowerCase();
  const email = String(student.email || "")
    .trim()
    .toLowerCase();

  return users.find((account) => {
    if (account.role !== "student") return false;
    return (
      account.id === student.studentUid ||
      account.id === student.userUid ||
      account.id === student.accountUid ||
      account.studentRecordId === student.id ||
      (studentId &&
        String(account.studentId || "")
          .trim()
          .toLowerCase() === studentId) ||
      (email &&
        String(account.email || "")
          .trim()
          .toLowerCase() === email)
    );
  });
}

function Students() {
  const { user } = useAuth();
  const [students, setStudents] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sourceErrors, setSourceErrors] = useState({});
  const [schoolYearRecords, setSchoolYearRecords] = useState([]);
  const [schoolYearError, setSchoolYearError] = useState("");
  const [schoolYearManagerOpen, setSchoolYearManagerOpen] = useState(false);
  const [schoolYearInput, setSchoolYearInput] = useState("");
  const [schoolYearSaving, setSchoolYearSaving] = useState(false);
  const [schoolYearUpdatingId, setSchoolYearUpdatingId] = useState("");
  const [schoolYearManagerError, setSchoolYearManagerError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [courseFilter, setCourseFilter] = useState("All courses");
  const [schoolYearFilter, setSchoolYearFilter] = useState("All school years");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [editingStudent, setEditingStudent] = useState(null);
  const [editForm, setEditForm] = useState(emptyNewStudent);
  const [accountStudent, setAccountStudent] = useState(null);
  const [addingStudent, setAddingStudent] = useState(false);
  const [newStudent, setNewStudent] = useState(emptyNewStudent);
  const [accountForm, setAccountForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
  });
  const [saving, setSaving] = useState(false);
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
          users:
            "Student accounts could not be checked. Account creation is disabled.",
        }));
        updateLoading();
      },
    );

    return () => {
      unsubscribeStudents();
      unsubscribeUsers();
    };
  }, []);

  useEffect(() => {
    return onSnapshot(
      collection(db, "schoolYears"),
      (snapshot) => {
        setSchoolYearRecords(
          snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
        );
        setSchoolYearError("");
      },
      (snapshotError) => {
        console.error("Unable to load school years:", snapshotError);
        setSchoolYearError(
          "School years could not be loaded. Check Firestore permissions and try again.",
        );
      },
    );
  }, []);

  const records = useMemo(() => normalizedStudents(students, []), [students]);
  const courses = useMemo(
    () =>
      [...new Set([...COURSES, ...records.map((student) => student.course)])]
        .filter(Boolean)
        .sort(),
    [records],
  );
  const schoolYears = useMemo(() => {
    return [
      ...new Set([
        ...schoolYearRecords.map((schoolYear) => schoolYear.name).filter(Boolean),
        ...records
          .map((student) => String(student.schoolYear || "").trim())
          .filter(Boolean),
      ]),
    ].sort((first, second) => {
      const firstYear = Number(String(first).match(/^\d{4}/)?.[0]);
      const secondYear = Number(String(second).match(/^\d{4}/)?.[0]);
      return secondYear - firstYear || first.localeCompare(second);
    });
  }, [records, schoolYearRecords]);
  const activeSchoolYears = useMemo(
    () =>
      schoolYearRecords
        .filter((schoolYear) => schoolYear.active !== false)
        .map((schoolYear) => schoolYear.name)
        .filter(Boolean)
        .sort((first, second) => String(second).localeCompare(String(first))),
    [schoolYearRecords],
  );
  const filteredStudents = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return records.filter((student) => {
      const account = accountForStudent(student, users);
      return (
        (!query ||
          `${student.name} ${student.studentId} ${student.course} ${student.schoolYear || ""} ${student.email || ""}`
            .toLowerCase()
            .includes(query)) &&
        (courseFilter === "All courses" || student.course === courseFilter) &&
        (schoolYearFilter === "All school years" ||
          (schoolYearFilter === "Not assigned"
            ? !student.schoolYear
            : student.schoolYear === schoolYearFilter)) &&
        (statusFilter === "Archived"
          ? student.isArchived === true
          : student.isArchived !== true) &&
        (["All statuses", "No account", "Archived"].includes(statusFilter) ||
          student.status === statusFilter) &&
        (statusFilter !== "No account" || !account)
      );
    });
  }, [courseFilter, records, schoolYearFilter, searchTerm, statusFilter, users]);
  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
  const visibleStudents = filteredStudents.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );
  const accountCount = records.filter(
    (student) =>
      student.isArchived !== true && accountForStudent(student, users),
  ).length;
  const counts = records
    .filter((student) => student.isArchived !== true)
    .reduce(
      (result, student) => {
        result[student.status] = (result[student.status] || 0) + 1;
        return result;
      },
      { DEPLOYED: 0, PROCESSING: 0, COMPLETED: 0 },
    );

  const coordinators = useMemo(
    () =>
      users.filter(
        (account) =>
          account.role === "coordinator" &&
          account.isArchived !== true &&
          account.isActive !== false,
      ),
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
      setNotice(
        `Auto-assigned ${count} student(s) to their department coordinator.`,
      );
      window.setTimeout(() => setNotice(""), 6000);
    } catch (assignError) {
      console.error("Unable to auto-assign students:", assignError);
      setError(
        `Auto-assignment could not be completed: ${assignError.message}`,
      );
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
    setSelectedStudent(student);
    setError("");
  };

  const openStudentEdit = (student) => {
    const account = accountForStudent(student, users);
    const { firstName, lastName } = splitName(student);
    setEditingStudent(student);
    setEditForm({
      firstName,
      lastName,
      studentId: student.studentId || "",
      email: account?.email || student.email || student.accountEmail || "",
      phone: student.phone || account?.phone || "",
      course: student.course || "",
      schoolYear: student.schoolYear || "",
      company: student.company || account?.company || "",
      coordinatorUid: student.coordinatorUid || account?.coordinatorUid || "",
      requiredHours: String(student.required || student.requiredHours || 486),
    });
    setError("");
  };

  const handleEditCourseChange = (course) => {
    const matched = findCoordinatorForCourse(course, users);
    setEditForm((current) => ({
      ...current,
      course,
      coordinatorUid: matched ? matched.id : current.coordinatorUid,
    }));
  };

  const saveStudentEdits = async (event) => {
    event.preventDefault();
    if (!editingStudent) return;
    if (sourceErrors.users) {
      setError("Student accounts could not be checked. Reload the page and try again.");
      return;
    }

    const studentId = editForm.studentId.trim();
    const email = editForm.email.trim();
    const normalizedEmail = email.toLowerCase();
    const account = accountForStudent(editingStudent, users);
    if (
      studentId &&
      records.some(
        (student) =>
          student.id !== editingStudent.id &&
          String(student.studentId || "").trim().toLowerCase() ===
            studentId.toLowerCase(),
      )
    ) {
      setError("A student with this student ID already exists.");
      return;
    }
    if (
      users.some(
        (userRecord) =>
          userRecord.id !== account?.id &&
          String(userRecord.email || "").trim().toLowerCase() ===
            normalizedEmail,
      )
    ) {
      setError("An account with this email address already exists.");
      return;
    }

    const requiredHours = Number(editForm.requiredHours);
    if (!Number.isFinite(requiredHours) || requiredHours < 1) {
      setError("Required OJT hours must be at least 1.");
      return;
    }

    const name = `${editForm.firstName.trim()} ${editForm.lastName.trim()}`;
    const coordinator = users.find(
      (userRecord) => userRecord.id === editForm.coordinatorUid,
    );
    const coordinatorName = coordinatorDisplayName(coordinator);
    const coordinatorChanged =
      editForm.coordinatorUid !==
      (editingStudent.coordinatorUid || account?.coordinatorUid || "");
    const coordinatorFields = editForm.coordinatorUid
      ? {
          coordinatorUid: editForm.coordinatorUid,
          ...(coordinatorName ? { coordinatorName } : {}),
        }
      : {
          coordinatorUid: deleteField(),
          coordinatorName: deleteField(),
        };
    const departmentFields = studentDepartmentFields(editForm.course);
    const studentUpdate = {
      name,
      firstName: editForm.firstName.trim(),
      lastName: editForm.lastName.trim(),
      studentId,
      email,
      accountEmail: account ? account.email : email,
      phone: editForm.phone.trim(),
      course: editForm.course,
      schoolYear: editForm.schoolYear.trim(),
      ...departmentFields,
      company: editForm.company.trim(),
      ...coordinatorFields,
      requiredHours,
      updatedAt: serverTimestamp(),
    };

    setSaving(true);
    setError("");
    try {
      await updateDoc(doc(db, "students", editingStudent.id), studentUpdate);
      const syncWarnings = [];

      if (account) {
        const accountChanges = {
          firstName: editForm.firstName.trim(),
          lastName: editForm.lastName.trim(),
          studentId,
          course: editForm.course,
          ...departmentFields,
          company: editForm.company.trim(),
          phone: editForm.phone.trim(),
        };
        const accountProfileChanged =
          coordinatorChanged ||
          Object.entries(accountChanges).some(
            ([field, value]) => account[field] !== value,
          );
        if (accountProfileChanged) {
          if (coordinatorChanged) {
            Object.assign(accountChanges, coordinatorFields);
          }
          accountChanges.updatedAt = serverTimestamp();
          const accountProfile = Object.fromEntries(
            Object.entries(account).filter(([key]) => key !== "id"),
          );
          try {
            const accountBatch = writeBatch(db);
            accountBatch.update(doc(db, "users", account.id), accountChanges);
            accountBatch.set(
              studentAccountRef(account.id),
              { ...accountProfile, ...accountChanges, uid: account.id },
              { merge: true },
            );
            await accountBatch.commit();
          } catch (syncError) {
            console.error(
              "Student record saved, but linked account synchronization failed:",
              syncError,
            );
            syncWarnings.push(
              `The student record was saved, but the linked account could not be synchronized: ${syncError.message || "permission denied"}`,
            );
          }
        }
      }

      if (coordinatorChanged) {
        try {
          const studentUid = editingStudent.studentUid || account?.id;
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
            ...(studentId
              ? [
                  getDocs(
                    query(
                      collection(db, "attendance"),
                      where("studentId", "==", studentId),
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
          const relatedRecords = [...attendanceRecords.values()];
          if (studentUid) {
            const loginSnapshot = await getDocs(
              query(
                collection(db, "studentLoginActivity"),
                where("userId", "==", studentUid),
              ),
            );
            relatedRecords.push(...loginSnapshot.docs);
          }
          for (
            let offset = 0;
            offset < relatedRecords.length;
            offset += 450
          ) {
            const relatedBatch = writeBatch(db);
            relatedRecords.slice(offset, offset + 450).forEach((record) => {
              relatedBatch.update(record.ref, {
                ...coordinatorFields,
                updatedAt: serverTimestamp(),
              });
            });
            await relatedBatch.commit();
          }
        } catch (syncError) {
          console.error(
            "Student record saved, but coordinator history synchronization failed:",
            syncError,
          );
          syncWarnings.push(
            `Coordinator history could not be fully synchronized: ${syncError.message || "permission denied"}`,
          );
        }
      }

      setNotice(
        syncWarnings.length
          ? `Student record saved for ${name}. ${syncWarnings.join(" ")}`
          : `Student details updated for ${name}.`,
      );
      setEditingStudent(null);
      window.setTimeout(() => setNotice(""), 5000);
    } catch (saveError) {
      console.error("Unable to save the student record:", saveError);
      setError(
        `Student record could not be saved. ${saveError.message || "Check your connection and Firestore permissions, then try again."}`,
      );
    } finally {
      setSaving(false);
    }
  };

  const createStudentAccount = async (event) => {
    event.preventDefault();
    if (!accountStudent) return;
    if (sourceErrors.users) {
      setError(
        "Student accounts could not be checked. Reload the page and try again.",
      );
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
        schoolYear: accountStudent.schoolYear || "",
        company: accountStudent.company || "",
        coordinatorUid: coordUid,
        coordinatorName: coordName,
      });

      setNotice(
        managedUser.emailStatus === "Sent"
          ? managedUser.notificationStatusSaved === false
            ? `Login account created and a password setup link was sent to ${managedUser.email}, but the email status could not be saved. You can resend the link from the student row.`
            : `Login account created for ${accountStudent.name}. A password setup link was sent to ${managedUser.email}.`
          : `Login account created for ${accountStudent.name}, but the password setup email could not be sent. Use Resend notification to try again.`,
      );
      setAccountStudent(null);
    } catch (saveError) {
      console.error("Unable to create or link student account:", saveError);
      setError(
        managedUser
          ? `The login account was created, but the notification could not be completed. ${saveError.message}`
          : saveError.message || "Unable to create the student account.",
      );
    } finally {
      setSaving(false);
    }
  };

  const resendStudentNotification = async (student) => {
    setSaving(true);
    setError("");
    try {
      const result = await resendStudentAccountNotification(student.id);
      setNotice(
        result.emailStatus === "Sent"
          ? result.notificationStatusSaved === false
            ? `Password setup link sent to ${result.email}, but the email status could not be saved. You can resend the link from the student row.`
            : `Password setup link sent to ${result.email}.`
          : `The password setup email could not be sent to ${result.email}. Please try again.`,
      );
      window.setTimeout(() => setNotice(""), 6000);
    } catch (resendError) {
      console.error("Unable to resend the student account notification:", resendError);
      setError(resendError.message || "Unable to resend the account notification.");
    } finally {
      setSaving(false);
    }
  };

  const createStudentAndAccount = async (event) => {
    event.preventDefault();
    if (sourceErrors.users) {
      setError(
        "Student accounts could not be checked. Reload the page and try again.",
      );
      return;
    }

    const studentId = newStudent.studentId.trim();
    const email = newStudent.email.trim();
    const schoolYear = newStudent.schoolYear.trim();
    const normalizedEmail = email.toLowerCase();
    if (!activeSchoolYears.includes(schoolYear)) {
      setError("Choose an active School Year from the list.");
      return;
    }
    if (
      studentId &&
      records.some(
        (student) =>
          String(student.studentId || "")
            .trim()
            .toLowerCase() === studentId.toLowerCase(),
      )
    ) {
      setError("A student with this student ID already exists.");
      return;
    }
    if (
      users.some(
        (account) =>
          String(account.email || "")
            .trim()
            .toLowerCase() === normalizedEmail,
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
      studentReference = await withTimeout(
        addDoc(collection(db, "students"), {
          name,
          firstName: newStudent.firstName.trim(),
          lastName: newStudent.lastName.trim(),
          studentId,
          email,
          phone: newStudent.phone.trim(),
          course: newStudent.course,
          schoolYear,
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
        }),
        "Saving the student record",
      );

      managedUser = await withTimeout(
        createManagedUser({
          firstName: newStudent.firstName,
          lastName: newStudent.lastName,
          email,
          phone: newStudent.phone,
          role: "student",
          createdBy: user?.uid || null,
          studentId,
          studentRecordId: studentReference.id,
          course: newStudent.course,
          schoolYear,
          company: newStudent.company,
          coordinatorUid: targetCoordinatorUid,
          coordinatorName: targetCoordinatorName,
        }),
        "Creating the login account",
      );

      setNotice(
        managedUser.emailStatus === "Sent"
          ? managedUser.notificationStatusSaved === false
            ? `Student and login account created for ${name}. A password setup link was sent to ${email}, but the email status could not be saved. You can resend the link from the student row.`
            : `Student and login account created for ${name}. A password setup link was sent to ${email}.`
          : `Student and login account created for ${name}, but the password setup email could not be sent. Use Resend notification to try again.`,
      );
      setAddingStudent(false);
      setNewStudent(emptyNewStudent);
    } catch (saveError) {
      console.error("Unable to create student and login account:", saveError);
      const partialMessage = managedUser
        ? `The account was created but its notification could not be completed. The account is linked to ${managedUser.email}.`
        : studentReference
          ? "The student roster record was saved, but the login account could not be created. You can create the account from this student's row."
          : "";
      setError(
        [saveError.message || "Unable to create student.", partialMessage]
          .filter(Boolean)
          .join(" "),
      );
    } finally {
      setSaving(false);
    }
  };

  const clearFilters = () => {
    setSearchTerm("");
    setCourseFilter("All courses");
    setSchoolYearFilter("All school years");
    setStatusFilter("All statuses");
    setPage(1);
  };

  const addSchoolYear = async (event) => {
    event.preventDefault();
    const normalizedSchoolYear = schoolYearInput
      .trim()
      .replace(/[–—]/g, "-")
      .replace(/\s+/g, "");
    const match = normalizedSchoolYear.match(/^(\d{4})-(\d{4})$/);
    if (!match || Number(match[2]) !== Number(match[1]) + 1) {
      setSchoolYearManagerError("Enter a school year in the format 2026-2027.");
      return;
    }

    setSchoolYearSaving(true);
    setSchoolYearManagerError("");
    try {
      const schoolYearRef = doc(db, "schoolYears", normalizedSchoolYear);
      await runTransaction(db, async (transaction) => {
        const existing = await transaction.get(schoolYearRef);
        if (existing.exists()) {
          throw new Error(
            existing.data().active === false
              ? "This School Year already exists. Activate it from the list."
              : "This School Year already exists.",
          );
        }
        transaction.set(schoolYearRef, {
          name: normalizedSchoolYear,
          active: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      setSchoolYearInput("");
    } catch (saveError) {
      console.error("Unable to add School Year:", saveError);
      setSchoolYearManagerError(
        saveError.message || "Unable to save this School Year.",
      );
    } finally {
      setSchoolYearSaving(false);
    }
  };

  const setSchoolYearActive = async (schoolYear, active) => {
    setSchoolYearUpdatingId(schoolYear.id);
    setSchoolYearManagerError("");
    try {
      await updateDoc(doc(db, "schoolYears", schoolYear.id), {
        active,
        updatedAt: serverTimestamp(),
      });
    } catch (updateError) {
      console.error("Unable to update School Year:", updateError);
      setSchoolYearManagerError(
        updateError.message || "Unable to update this School Year.",
      );
    } finally {
      setSchoolYearUpdatingId("");
    }
  };

  const detailAccount = selectedStudent
    ? accountForStudent(selectedStudent, users)
    : null;
  const detailCoordinatorUid =
    selectedStudent?.coordinatorUid || detailAccount?.coordinatorUid;
  const detailCoordinator = users.find(
    (account) => account.id === detailCoordinatorUid,
  );
  const detailCoordinatorName =
    coordinatorDisplayName(detailCoordinator) ||
    selectedStudent?.coordinatorName ||
    detailAccount?.coordinatorName ||
    "Not assigned";
  const editingCoordinator = users.find(
    (account) => account.id === editForm.coordinatorUid,
  );

  if (loading) {
    return (
      <main className="students-page students-state">
        Loading enrolled students...
      </main>
    );
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
        <div
          style={{
            display: "flex",
            gap: "10px",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {unassignedMatchingStudents.length > 0 && (
            <button
              type="button"
              className="students-secondary"
              disabled={batchAssigning}
              onClick={autoAssignAllUnassigned}
              title={`Automatically link ${unassignedMatchingStudents.length} student(s) to their department coordinator`}
            >
              {batchAssigning
                ? "Assigning..."
                : `Auto-Assign Coordinators (${unassignedMatchingStudents.length})`}
            </button>
          )}
          <button
            type="button"
            className="students-secondary"
            onClick={() => {
              setSchoolYearManagerError("");
              setSchoolYearManagerOpen(true);
            }}
          >
            Manage School Years
          </button>
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

      {(error || schoolYearError || Object.values(sourceErrors).length > 0) && (
        <div className="students-error" role="alert">
          {error || schoolYearError || Object.values(sourceErrors).join(" ")}
        </div>
      )}

      <section
        className="students-summary"
        aria-label="Student account summary"
      >
        <article className="students-stat">
          <span className="students-stat-icon blue">
            <Search size={19} />
          </span>
          <div>
            <p>Enrolled Students</p>
            <strong>{records.length}</strong>
          </div>
        </article>
        <article className="students-stat">
          <span className="students-stat-icon green">
            <KeyRound size={19} />
          </span>
          <div>
            <p>Accounts Created</p>
            <strong>{accountCount}</strong>
          </div>
        </article>
        <article className="students-stat">
          <span className="students-stat-icon amber">
            <KeyRound size={19} />
          </span>
          <div>
            <p>No Account Yet</p>
            <strong>{records.length - accountCount}</strong>
          </div>
        </article>
        <article className="students-stat">
          <span className="students-stat-icon indigo">
            <Eye size={19} />
          </span>
          <div>
            <p>On Practicum / Internship</p>
            <strong>{counts.DEPLOYED}</strong>
          </div>
        </article>
      </section>

      <section className="students-panel">
        <div className="students-toolbar">
          <label className="students-search">
            <Search size={17} />
            <span className="sr-only">Search enrolled students</span>
            <input
              placeholder="Search name, student ID, email, course, or school year"
              value={searchTerm}
              onChange={(event) =>
                updateFilter(setSearchTerm, event.target.value)
              }
            />
          </label>
          <div className="students-filters">
            <select
              className="students-select"
              aria-label="Filter by course"
              value={courseFilter}
              onChange={(event) =>
                updateFilter(setCourseFilter, event.target.value)
              }
            >
              <option>All courses</option>
              {courses.map((course) => (
                <option key={course}>{course}</option>
              ))}
            </select>
            <select
              className="students-select"
              aria-label="Filter by school year"
              value={schoolYearFilter}
              onChange={(event) =>
                updateFilter(setSchoolYearFilter, event.target.value)
              }
            >
              <option>All school years</option>
              {schoolYears.map((schoolYear) => (
                <option key={schoolYear}>{schoolYear}</option>
              ))}
              {records.some((student) => !student.schoolYear) && (
                <option>Not assigned</option>
              )}
            </select>
            <select
              className="students-select"
              aria-label="Filter by student status"
              value={statusFilter}
              onChange={(event) =>
                updateFilter(setStatusFilter, event.target.value)
              }
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
                <th>School Year</th>
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
                        <span
                          className={`student-avatar ${avatarColors[index % avatarColors.length]}`}
                        >
                          {student.name
                            .split(/\s+/)
                            .map((part) => part[0])
                            .join("")}
                        </span>
                        <div>
                          <strong>{student.name}</strong>
                          <span>
                            {student.email ||
                              student.accountEmail ||
                              "Email not provided"}
                          </span>
                          {account?.accountNotificationStatus && (
                            <small
                              className={`account-notification-status ${account.accountNotificationStatus.toLowerCase()}`}
                            >
                              Password setup email: {account.accountNotificationStatus}
                            </small>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="student-id">
                        {student.studentId || "—"}
                      </span>
                    </td>
                    <td>{student.schoolYear || "—"}</td>
                    <td><DepartmentBadge value={student.course || student.department} /></td>
                    <td>
                      <span className={`student-status ${statusClass}`}>
                        {student.status}
                      </span>
                    </td>
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
                        <button
                          type="button"
                          className="student-action"
                          title="Edit student"
                          aria-label={`Edit ${student.name}`}
                          onClick={() => openStudentEdit(student)}
                        >
                          <Pencil size={15} />
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
                        {account && isAccountLive(account) && (
                          <button
                            type="button"
                            className="student-action"
                            title="Send password setup email"
                            aria-label={`Send password setup email to ${student.name}`}
                            disabled={saving}
                            onClick={() => resendStudentNotification(student)}
                          >
                            <Mail size={15} />
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
              <strong>
                {sourceErrors.students
                  ? "Student records unavailable"
                  : "No students found"}
              </strong>
              <span>
                {sourceErrors.students ||
                  "Try changing your search or filters."}
              </span>
              {!sourceErrors.students && (
                <button type="button" onClick={clearFilters}>
                  Clear filters
                </button>
              )}
            </div>
          )}
        </div>

        <footer className="students-footer">
          <span>
            Showing {filteredStudents.length ? (page - 1) * pageSize + 1 : 0}–
            {Math.min(page * pageSize, filteredStudents.length)} of{" "}
            {filteredStudents.length} students
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
            <button
              type="button"
              className="student-page-button current"
              aria-label="Current page"
              disabled
            >
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
        <div
          className="students-modal-backdrop"
          role="presentation"
          onClick={(event) =>
            event.target === event.currentTarget && setSelectedStudent(null)
          }
        >
          <section
            className="students-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="student-modal-title"
          >
            <header className="students-modal-header">
              <div>
                <h2 id="student-modal-title">{selectedStudent.name}</h2>
                <p>
                  {selectedStudent.studentId || "No student ID"} ·{" "}
                  <DepartmentBadge value={selectedStudent.course || selectedStudent.department} />
                </p>
              </div>
              <button
                type="button"
                className="students-modal-close"
                aria-label="Close student details"
                onClick={() => setSelectedStudent(null)}
              >
                <X size={17} />
              </button>
            </header>
            <div className="students-modal-body">
              <div className="student-detail">
                <label>Contact email</label>
                <strong>{selectedStudent.email || "Not provided"}</strong>
              </div>
              <div className="student-detail">
                <label>School Year</label>
                <strong>{selectedStudent.schoolYear || "Not assigned"}</strong>
              </div>
              <div className="student-detail">
                <label>OJT status</label>
                <strong>{selectedStudent.status}</strong>
              </div>
              <div className="student-detail">
                <label>Partner company</label>
                <strong>{selectedStudent.company}</strong>
              </div>
              <div className="student-detail">
                <label>Hours progress</label>
                <strong>
                  {selectedStudent.completed} of {selectedStudent.required}{" "}
                  hours
                </strong>
              </div>
              <div className="student-detail">
                <label>Assigned coordinator</label>
                <strong>{detailCoordinatorName}</strong>
              </div>
            </div>
          </section>
        </div>
      )}

      {editingStudent && (
        <div
          className="students-modal-backdrop"
          role="presentation"
          onClick={(event) =>
            event.target === event.currentTarget &&
            !saving &&
            setEditingStudent(null)
          }
        >
          <section
            className="students-modal students-add-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-student-title"
          >
            <header className="students-modal-header">
              <div>
                <h2 id="edit-student-title">Edit Student</h2>
                <p>Update this enrolled student record.</p>
              </div>
              <button
                type="button"
                className="students-modal-close"
                aria-label="Close edit student form"
                disabled={saving}
                onClick={() => setEditingStudent(null)}
              >
                <X size={17} />
              </button>
            </header>
            {schoolYearError && (
              <div
                className="students-error"
                role="alert"
                style={{ margin: "16px 24px 0" }}
              >
                {schoolYearError}
              </div>
            )}
            <form
              className="students-account-form students-add-form"
              onSubmit={saveStudentEdits}
            >
              <label>
                First name
                <input
                  required
                  value={editForm.firstName}
                  onChange={(event) =>
                    setEditForm((current) => ({
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
                  value={editForm.lastName}
                  onChange={(event) =>
                    setEditForm((current) => ({
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
                  value={editForm.studentId}
                  onChange={(event) =>
                    setEditForm((current) => ({
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
                  readOnly={Boolean(accountForStudent(editingStudent, users))}
                  value={editForm.email}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                />
                {accountForStudent(editingStudent, users) && (
                  <small>Change the email through account management for a linked login.</small>
                )}
              </label>
              <label>
                Phone
                <input
                  type="tel"
                  value={editForm.phone}
                  onChange={(event) =>
                    setEditForm((current) => ({
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
                  value={editForm.course}
                  onChange={(event) =>
                    handleEditCourseChange(event.target.value)
                  }
                >
                  <option value="">Select a course</option>
                  {COURSES.map((course) => (
                    <option key={course} value={course}>
                      {course}
                    </option>
                  ))}
                  {editForm.course && !COURSES.includes(editForm.course) && (
                    <option value={editForm.course}>{editForm.course}</option>
                  )}
                </select>
              </label>
              <label>
                School Year
                <select
                  value={editForm.schoolYear}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      schoolYear: event.target.value,
                    }))
                  }
                >
                  <option value="">Select a School Year</option>
                  {activeSchoolYears.map((schoolYear) => (
                    <option key={schoolYear} value={schoolYear}>
                      {schoolYear}
                    </option>
                  ))}
                  {editForm.schoolYear &&
                    !activeSchoolYears.includes(editForm.schoolYear) && (
                      <option value={editForm.schoolYear}>
                        {editForm.schoolYear} (current)
                      </option>
                    )}
                </select>
              </label>
              <label>
                Partner company
                <input value={editForm.company} disabled />
              </label>
              <label>
                Assigned coordinator
                <select
                  value={editForm.coordinatorUid}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      coordinatorUid: event.target.value,
                    }))
                  }
                >
                  <option value="">Unassigned</option>
                  {editForm.coordinatorUid &&
                    !coordinators.some(
                      (coordinator) =>
                        coordinator.id === editForm.coordinatorUid,
                    ) && (
                      <option value={editForm.coordinatorUid}>
                        {coordinatorDisplayName(editingCoordinator) ||
                          editingStudent.coordinatorName ||
                          "Current assignment"}
                      </option>
                    )}
                  {coordinators.map((coordinator) => (
                    <option key={coordinator.id} value={coordinator.id}>
                      {coordinatorDisplayName(coordinator)}
                      {coordinator.department
                        ? ` — ${departmentLabel(coordinator.department)}`
                        : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Required OJT hours
                <input
                  type="number"
                  min="1"
                  required
                  value={editForm.requiredHours}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      requiredHours: event.target.value,
                    }))
                  }
                />
              </label>
              {error && (
                <div
                  className="students-error"
                  role="alert"
                  style={{ gridColumn: "1 / -1" }}
                >
                  {error}
                </div>
              )}
              <footer>
                <button
                  type="button"
                  className="students-secondary"
                  disabled={saving}
                  onClick={() => setEditingStudent(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="students-primary"
                  disabled={saving}
                >
                  {saving ? "Saving changes..." : "Save changes"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {accountStudent && (
        <div
          className="students-modal-backdrop"
          role="presentation"
          onClick={(event) =>
            event.target === event.currentTarget &&
            !saving &&
            setAccountStudent(null)
          }
        >
          <section
            className="students-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-modal-title"
          >
            <header className="students-modal-header">
              <div>
                <h2 id="account-modal-title">Create student login</h2>
                <p>
                  {accountStudent.name} ·{" "}
                  {accountStudent.studentId || (
                    <DepartmentBadge value={accountStudent.course || accountStudent.department} />
                  )}
                </p>
              </div>
              <button
                type="button"
                className="students-modal-close"
                aria-label="Close account form"
                disabled={saving}
                onClick={() => setAccountStudent(null)}
              >
                <X size={17} />
              </button>
            </header>
            <form
              className="students-account-form"
              onSubmit={createStudentAccount}
            >
              <label>
                First name
                <input
                  required
                  value={accountForm.firstName}
                  onChange={(event) =>
                    setAccountForm((current) => ({
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
                  value={accountForm.lastName}
                  onChange={(event) =>
                    setAccountForm((current) => ({
                      ...current,
                      lastName: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Email address
                <input
                  type="email"
                  required
                  value={accountForm.email}
                  onChange={(event) =>
                    setAccountForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                />
              </label>
              <p>
                A password setup link will be sent to this email address. The
                account will be linked to this enrolled student record.
              </p>
              {error && (
                <div className="students-error" role="alert">
                  {error}
                </div>
              )}
              <footer>
                <button
                  type="button"
                  className="students-secondary"
                  disabled={saving}
                  onClick={() => setAccountStudent(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="students-primary"
                  disabled={saving}
                >
                  {saving ? "Creating account..." : "Create account"}
                </button>
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
                School Year
                <select
                  required
                  value={newStudent.schoolYear}
                  onChange={(event) =>
                    setNewStudent((current) => ({
                      ...current,
                      schoolYear: event.target.value,
                    }))
                  }
                >
                  <option value="">Select a School Year</option>
                  {activeSchoolYears.map((schoolYear) => (
                    <option key={schoolYear} value={schoolYear}>
                      {schoolYear}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Partner company
                <input
                  value={newStudent.company}
                  disabled
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
                    const isAuto =
                      autoMatchedCoordinator?.id === coordinator.id;
                    return (
                      <option key={coordinator.id} value={coordinator.id}>
                        {coordinatorDisplayName(coordinator)}
                        {coordinator.department
                          ? ` — ${departmentLabel(coordinator.department)}`
                          : ""}
                        {isAuto ? " (Auto-matched)" : ""}
                      </option>
                    );
                  })}
                </select>
                {autoMatchedCoordinator && (
                  <span
                    style={{
                      fontSize: "11px",
                      color: "#16866f",
                      fontWeight: "normal",
                    }}
                  >
                    ✓ Auto-assigned to{" "}
                    {coordinatorDisplayName(autoMatchedCoordinator)} based on
                    program
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
                A password setup link will be sent to the student. The student
                will appear on the coordinator roster automatically.
              </p>
              {error && (
                <div
                  className="students-error"
                  role="alert"
                  style={{ gridColumn: "1 / -1" }}
                >
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

      {schoolYearManagerOpen && (
        <div
          className="students-modal-backdrop"
          role="presentation"
          onClick={(event) =>
            event.target === event.currentTarget &&
            !schoolYearSaving &&
            setSchoolYearManagerOpen(false)
          }
        >
          <section
            className="students-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="school-year-manager-title"
          >
            <header className="students-modal-header">
              <div>
                <h2 id="school-year-manager-title">Manage School Years</h2>
                <p>Active years are available when adding students.</p>
              </div>
              <button
                type="button"
                className="students-modal-close"
                aria-label="Close School Year management"
                disabled={schoolYearSaving}
                onClick={() => setSchoolYearManagerOpen(false)}
              >
                <X size={17} />
              </button>
            </header>
            <form
              className="students-account-form school-year-form"
              onSubmit={addSchoolYear}
            >
              <label>
                New School Year
                <input
                  type="text"
                  required
                  value={schoolYearInput}
                  placeholder="e.g. 2026-2027"
                  onChange={(event) => setSchoolYearInput(event.target.value)}
                />
              </label>
              {schoolYearManagerError && (
                <div className="students-error" role="alert">
                  {schoolYearManagerError}
                </div>
              )}
              <button
                type="submit"
                className="students-primary"
                disabled={schoolYearSaving}
              >
                {schoolYearSaving ? "Saving..." : "Add School Year"}
              </button>
            </form>
            <div className="school-year-list" aria-live="polite">
              {schoolYearRecords.length ? (
                [...schoolYearRecords]
                  .sort((first, second) =>
                    String(second.name).localeCompare(String(first.name)),
                  )
                  .map((schoolYear) => (
                    <div className="school-year-row" key={schoolYear.id}>
                      <div>
                        <strong>{schoolYear.name}</strong>
                        <span>
                          {schoolYear.active === false ? "Inactive" : "Active"}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="students-secondary"
                        disabled={schoolYearUpdatingId === schoolYear.id}
                        onClick={() =>
                          setSchoolYearActive(
                            schoolYear,
                            schoolYear.active === false,
                          )
                        }
                      >
                        {schoolYearUpdatingId === schoolYear.id
                          ? "Saving..."
                          : schoolYear.active === false
                            ? "Activate"
                            : "Deactivate"}
                      </button>
                    </div>
                  ))
              ) : (
                <p className="school-year-empty">
                  No School Years yet. Add one above to enable the student form.
                </p>
              )}
            </div>
          </section>
        </div>
      )}

      {notice && (
        <div className="students-notice" role="status">
          {notice}
        </div>
      )}
    </main>
  );
}

export default Students;
