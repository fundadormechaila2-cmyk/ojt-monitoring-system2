import { getRecordPeriods, summarizeAttendance } from "./manualAttendanceService";

export function formatAttendanceDate(value) {
  if (!value) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function withAttendanceTimes(record) {
  const periods = getRecordPeriods(record);
  const summary = summarizeAttendance(periods);
  return {
    ...record,
    ...periods,
    totalHours: summary.totalHours,
    status: record.status === "Absent" ? "Absent" : summary.status,
  };
}

export function sortAttendanceRecords(records) {
  return [...records].sort((left, right) =>
    `${right.date || ""} ${right.updatedAt?.seconds || ""}`.localeCompare(
      `${left.date || ""} ${left.updatedAt?.seconds || ""}`,
    ),
  );
}
