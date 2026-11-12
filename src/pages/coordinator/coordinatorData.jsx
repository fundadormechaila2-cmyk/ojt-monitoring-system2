/* eslint-disable react-refresh/only-export-components */
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/useAuth";
import { auth, db } from "../../services/firebase";
import { recordDepartmentId } from "../../constants/departments";
import { subscribeToCoordinatorAttendance } from "../../services/coordinatorAttendanceService";
import "../../styles/coordinator-module.css";

const coordinatorSources = ["students", "attendance"];
const emptyData = { students: [], attendance: [] };

export function useCoordinatorData() {
  const { user } = useAuth();
  const uid = user?.role === "coordinator" ? auth.currentUser?.uid : "";
  const departmentId = recordDepartmentId(user);
  const key = `${uid}:${departmentId}`;
  const [state, setState] = useState({ key: "", data: emptyData, loaded: [], error: "" });

  useEffect(() => {
    if (!uid || !departmentId) return undefined;
    let active = true;
    const subscribe = (source, onItems, onError) => source === "attendance"
      ? subscribeToCoordinatorAttendance(uid, departmentId, onItems, onError)
      : onSnapshot(
          query(collection(db, source), where("coordinatorUid", "==", uid), where("departmentId", "==", departmentId)),
          (snapshot) => onItems(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
          onError,
        );
    const unsubscribers = coordinatorSources.map((source) =>
      subscribe(
        source,
        (items) => {
          if (!active) return;
          setState((current) => {
            const previous = current.key === key
              ? current
              : { key, data: emptyData, loaded: [], error: "" };
            return {
              ...previous,
              data: {
                ...previous.data,
                [source]: items,
              },
              loaded: [...new Set([...previous.loaded, source])],
            };
          });
        },
        (snapshotError) => {
          console.error(`Unable to load ${source}:`, snapshotError);
          if (!active) return;
          setState((current) => {
            const previous = current.key === key
              ? current
              : { key, data: emptyData, loaded: [], error: "" };
            return {
              ...previous,
              loaded: [...new Set([...previous.loaded, source])],
              error: `Unable to load assigned ${source} (${snapshotError.code || "unknown error"}).`,
            };
          });
        },
      ),
    );
    return () => {
      active = false;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [uid, departmentId, key]);

  return {
    data: state.key === key ? state.data : emptyData,
    loading: Boolean(uid && departmentId) && (state.key !== key || state.loaded.length < coordinatorSources.length),
    error: !uid ? "Sign in as a coordinator to view assigned records." : !departmentId ? "Your coordinator account has no recognized department. Ask an administrator to assign one in OJT Coordinators." : state.key === key ? state.error : "",
  };
}

export function valueOf(record, keys, fallback = "") {
  return (
    keys
      .map((key) => record[key])
      .find((value) => value !== undefined && value !== null && value !== "") ??
    fallback
  );
}
export function studentNameOf(record) {
  return valueOf(
    record,
    ["name", "fullName", "studentName", "student"],
    `${record.firstName || ""} ${record.lastName || ""}`.trim() ||
      "Unnamed student",
  );
}
export function studentIdOf(record) {
  return valueOf(record, ["studentId", "studentID", "idNumber", "id"], "");
}
export function hoursForStudent(student, attendance) {
  const stored = Number(
    valueOf(
      student,
      ["completedHours", "ojtHours", "hoursCompleted", "hours"],
      0,
    ),
  );
  if (stored) return stored;
  const id = studentIdOf(student);
  return attendance
    .filter((item) => studentIdOf(item) === id)
    .reduce(
      (sum, item) => sum + Number(valueOf(item, ["totalHours", "hours"], 0)),
      0,
    );
}
export function requiredHours(student) {
  return Number(
    valueOf(
      student,
      ["requiredHours", "totalRequiredHours", "ojtRequiredHours"],
      500,
    ),
  );
}
export function normalizedStudents(students, attendance) {
  return students.map((student) => {
    const completed = hoursForStudent(student, attendance);
    const required = requiredHours(student);
    const rawStatus = String(
      valueOf(student, ["ojtStatus", "status", "placementStatus"], ""),
    ).toLowerCase();
    const status =
      rawStatus.includes("complete") || completed >= required
        ? "Completed"
        : rawStatus.includes("pending") || rawStatus.includes("not started")
          ? "Pending"
          : "Ongoing";
    return {
      ...student,
      studentId: studentIdOf(student),
      name: studentNameOf(student),
      course: valueOf(
        student,
        ["course", "program", "courseProgram"],
        "Not specified",
      ),
      company: valueOf(
        student,
        ["company", "partnerCompany", "companyName"],
        "Not assigned",
      ),
      completed,
      required,
      remaining: Math.max(0, required - completed),
      status,
    };
  });
}
export function CoordinatorState({ loading, error, children }) {
  if (loading)
    return (
      <main className="coordinator-module-state">
        Loading coordinator data...
      </main>
    );
  if (error)
    return (
      <main
        className="coordinator-module-state coordinator-module-error"
        role="alert"
      >
        {error}
      </main>
    );
  return children;
}
export function useFilteredStudents(records, search, filters = {}) {
  return useMemo(
    () =>
      records.filter((record) => {
        const query = search.trim().toLowerCase();
        return (
          (!query ||
            `${record.name} ${record.studentId} ${record.course} ${record.company}`
              .toLowerCase()
              .includes(query)) &&
          (!filters.status ||
            filters.status === "All statuses" ||
            record.status === filters.status) &&
          (!filters.course ||
            filters.course === "All courses" ||
            record.course === filters.course) &&
          (!filters.company ||
            filters.company === "All companies" ||
            record.company === filters.company)
        );
      }),
    [filters.company, filters.course, filters.status, records, search],
  );
}
