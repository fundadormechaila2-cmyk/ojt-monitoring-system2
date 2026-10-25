/* eslint-disable react-refresh/only-export-components */
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { db } from "../../services/firebase";
import { withoutArchived } from "../../services/recordState";
import { useAuth } from "../../context/useAuth";
import "../../styles/coordinator-module.css";

export const coordinatorSources = [
  "students",
  "applications",
  "attendance",
  "evaluations",
  "partnerCompanies",
];
const departmentScopedSources = [
  "students",
  "applications",
  "attendance",
  "evaluations",
];

export function useCoordinatorData(sources = coordinatorSources) {
  const { user } = useAuth();
  const [data, setData] = useState(
    Object.fromEntries(sources.map((source) => [source, []])),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let loaded = 0;
    const unsubscribers = sources.map((source) =>
      onSnapshot(
        user?.role === "coordinator" &&
          user.uid &&
          departmentScopedSources.includes(source)
          ? query(
              collection(db, source),
              where("coordinatorUid", "==", user.uid),
            )
          : collection(db, source),
        (snapshot) => {
          setData((current) => ({
            ...current,
            [source]: withoutArchived(snapshot.docs.map((item) => ({
              id: item.id,
              ...item.data(),
            }))),
          }));
          loaded += 1;
          if (loaded === sources.length) setLoading(false);
        },
        (snapshotError) => {
          console.error(`Unable to load ${source}:`, snapshotError);
          setError(
            snapshotError.code === "permission-denied"
              ? `You do not have permission to view ${source}. Update your Firestore rules for coordinator access.`
              : `Unable to load ${source} (${snapshotError.code || "unknown error"}).`,
          );
          loaded += 1;
          if (loaded === sources.length) setLoading(false);
        },
      ),
    );
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [sources, user?.role, user?.uid]);
  return { data, loading, error };
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
    const completed = Math.round(hoursForStudent(student, attendance) * 100) / 100;
    const required = requiredHours(student);
    const rawStatus = String(
      valueOf(student, ["ojtStatus", "status", "placementStatus"], ""),
    ).toLowerCase();
    const status =
      rawStatus.includes("complete") || completed >= required
        ? "COMPLETED"
        : rawStatus.includes("pending") || rawStatus.includes("not started")
          ? "PROCESSING"
          : "DEPLOYED";
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
      remaining: Math.round(Math.max(0, required - completed) * 100) / 100,
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
