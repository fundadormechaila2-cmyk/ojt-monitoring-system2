import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { Search } from "lucide-react";
import { db } from "../../services/firebase";
import { PageHeader } from "./SupervisorComponents";

const attendanceGroups = [
  {
    value: "am",
    label: "AM",
    columns: [
      { value: "amIn", label: "IN" },
      { value: "amOut", label: "OUT" },
    ],
  },
  {
    value: "pm",
    label: "PM",
    columns: [
      { value: "pmIn", label: "IN" },
      { value: "pmOut", label: "OUT" },
    ],
  },
  {
    value: "overtime",
    label: "OVERTIME",
    columns: [
      { value: "overtimeIn", label: "IN" },
      { value: "overtimeOut", label: "OUT" },
    ],
  },
];

const attendancePeriods = attendanceGroups.flatMap((group) => group.columns);

function getLocalDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function studentIdOf(student) {
  return String(
    student.studentId ||
      student.studentID ||
      student.idNumber ||
      student.id ||
      "",
  );
}

function studentNameOf(student) {
  return (
    student.name ||
    student.fullName ||
    student.studentName ||
    `${student.firstName || ""} ${student.lastName || ""}`.trim() ||
    student.email ||
    "Unnamed student"
  );
}

function attendanceTime(record, period) {
  const legacyFields = {
    amIn: record.timeIn || record.morningTimeIn,
    amOut: record.morningTimeOut,
    pmIn: record.afternoonTimeIn,
    pmOut: record.timeOut || record.afternoonTimeOut,
    overtimeIn: record.overtimeIn || record.otIn,
    overtimeOut: record.overtimeOut || record.otOut,
  };
  return record[period] || legacyFields[period] || "";
}

function Attendance() {
  const [records, setRecords] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState(getLocalDate);

  useEffect(() => {
    const unsubscribeRecords = onSnapshot(
      collection(db, "attendance"),
      (snapshot) => {
        setRecords(
          snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
        );
        setLoading(false);
        setError("");
      },
      (snapshotError) => {
        console.error("Unable to load supervisor attendance records:", snapshotError);
        setLoading(false);
        setError("Attendance records could not be loaded. Check Firestore permissions.");
      },
    );

    const unsubscribeStudents = onSnapshot(
      collection(db, "students"),
      (snapshot) => {
        setStudents(
          snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
        );
      },
      (snapshotError) => {
        console.error("Unable to load students for manual attendance:", snapshotError);
        setError("Student records could not be loaded. Check Firestore permissions.");
      },
    );

    return () => {
      unsubscribeRecords();
      unsubscribeStudents();
    };
  }, []);

  const studentById = useMemo(
    () => new Map(students.map((student) => [studentIdOf(student), student])),
    [students],
  );

  const visibleRecords = useMemo(() => {
    const query = search.trim().toLowerCase();
    return records
      .filter((record) => !dateFilter || record.date === dateFilter)
      .filter((record) => {
        if (!query) return true;
        const student =
          studentById.get(String(record.studentId || "")) ||
          students.find((item) => item.id === record.studentUid);
        const name =
          record.studentName || record.student || studentNameOf(student || {});
        return `${name} ${record.studentId || ""} ${record.company || ""}`
          .toLowerCase()
          .includes(query);
      })
      .sort((left, right) =>
        `${right.date || ""}${right.updatedAt?.seconds || ""}`.localeCompare(
          `${left.date || ""}${left.updatedAt?.seconds || ""}`,
        ),
      );
  }, [dateFilter, records, search, studentById, students]);

  return (
    <div className="supervisor-page space-y-6">
      <PageHeader
        eyebrow="Supervisor workspace · Attendance"
        title="Attendance Records"
        description="Review student attendance records by date and search."
      />

      <section className="supervisor-panel supervisor-table-panel">
        <div className="supervisor-toolbar flex-wrap">
          <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-slate-400">
            <Search size={16} />
            <span className="sr-only">Search attendance records</span>
            <input
              className="min-w-0 flex-1 border-0 p-0 text-sm text-slate-800 outline-none focus:ring-0"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search student name or ID"
            />
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            Date
            <input
              className="supervisor-select"
              type="date"
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
            />
          </label>
        </div>

        {error && (
          <p className="px-5 py-3 text-sm text-rose-700" role="alert">
            {error}
          </p>
        )}

        <div className="supervisor-table-wrap">
          <table className="supervisor-table">
            <thead>
              <tr>
                <th rowSpan={2}>Date</th>
                <th rowSpan={2}>Student</th>
                <th rowSpan={2}>ID Number</th>
                {attendanceGroups.map((group) => (
                  <th key={group.value} colSpan={group.columns.length} className="text-center">
                    {group.label}
                  </th>
                ))}
                <th rowSpan={2}>Hours</th>
                <th rowSpan={2}>Status</th>
              </tr>
              <tr>
                {attendanceGroups.flatMap((group) =>
                  group.columns.map((column) => (
                    <th key={`${group.value}-${column.value}`} className="text-center">
                      {column.label}
                    </th>
                  )),
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="9">Loading attendance records...</td>
                </tr>
              ) : visibleRecords.length === 0 ? (
                <tr>
                  <td colSpan="9">
                    {error
                      ? "Attendance records are unavailable."
                      : "No attendance records found for this date."}
                  </td>
                </tr>
              ) : (
                visibleRecords.map((record) => {
                  const student =
                    studentById.get(String(record.studentId || "")) ||
                    students.find((item) => item.id === record.studentUid);
                  return (
                    <tr key={record.id}>
                      <td>{record.date || "—"}</td>
                      <td>
                        <strong>
                          {record.studentName ||
                            record.student ||
                            studentNameOf(student || {})}
                        </strong>
                      </td>
                      <td>{record.studentId || studentIdOf(student || {}) || "—"}</td>
                      {attendancePeriods.map((item) => (
                        <td key={item.value}>
                          {attendanceTime(record, item.value) || "—"}
                        </td>
                      ))}
                      <td>
                        {Number(
                          record.totalHours ?? record.hours ?? 0,
                        ).toFixed(2)}
                      </td>
                      <td>
                        <span
                          className={`supervisor-status ${
                            String(record.status || "Pending")
                              .toLowerCase()
                              .replace(/\s+/g, "-")
                          }`}
                        >
                          {record.status || "Pending"}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <footer className="px-5 py-3 text-xs text-slate-500">
          Showing {visibleRecords.length} attendance record
          {visibleRecords.length === 1 ? "" : "s"}
        </footer>
      </section>
    </div>
  );
}

export default Attendance;
