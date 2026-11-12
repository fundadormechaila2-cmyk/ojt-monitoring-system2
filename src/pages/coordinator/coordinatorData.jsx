/* eslint-disable react-refresh/only-export-components */
import { collection, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { db } from "../../services/firebase";
import "../../styles/coordinator-module.css";

export const coordinatorSources = [
  "students",
  "applications",
  "attendance",
  "evaluations",
  "partnerCompanies",
];

export function useCoordinatorData(sources = coordinatorSources) {
  const [data, setData] = useState(
    Object.fromEntries(sources.map((source) => [source, []])),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let loaded = 0;
    const unsubscribers = sources.map((source) =>
      onSnapshot(
        collection(db, source),
        (snapshot) => {
          setData((current) => ({
            ...current,
            [source]: snapshot.docs.map((item) => ({
              id: item.id,
              ...item.data(),
            })),
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
  }, [sources]);
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
