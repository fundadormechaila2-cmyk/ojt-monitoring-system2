import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import {
  ClipboardCheck,
  Clock3,
  Download,
  Printer,
  Search,
  UsersRound,
  X,
} from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { db } from "../../services/firebase";
import {
  formatHoursMinutes,
  getRecordPeriods,
  summarizeAttendance,
} from "../../services/manualAttendanceService";
import { PageHeader } from "./SupervisorComponents";
import "../../styles/tailwind.css";
import "../../styles/supervisor-dtr.css";

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
  return getRecordPeriods(record)[period] || "";
}

function attendanceDate(record) {
  if (typeof record.date === "string") return record.date.slice(0, 10);
  const date = record.date?.toDate?.() || record.date;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function hoursForRecord(record) {
  return summarizeAttendance(getRecordPeriods(record)).totalHours;
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function recordSummary(record) {
  const summary = summarizeAttendance(getRecordPeriods(record));
  const stored = String(record.status || "");
  return {
    hours: summary.totalHours,
    status: stored === "Absent" ? "Absent" : summary.status,
  };
}

function Attendance() {
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState(getLocalDate);
  const [selectedDtr, setSelectedDtr] = useState(null);

  useEffect(() => {
    if (!user?.uid) return undefined;
    const unsubscribeRecords = onSnapshot(
      query(
        collection(db, "attendance"),
        where("supervisorId", "==", user.uid),
      ),
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
      query(
        collection(db, "students"),
        where("supervisorUid", "==", user.uid),
      ),
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
  }, [user?.uid]);

  const studentById = useMemo(
    () => new Map(students.map((student) => [studentIdOf(student), student])),
    [students],
  );

  const visibleRecords = useMemo(() => {
    const query = search.trim().toLowerCase();
    return records
      .filter((record) => !dateFilter || attendanceDate(record) === dateFilter)
      .filter((record) => {
        if (!query) return true;
        const student =
          students.find(
            (item) =>
              item.studentUid === record.studentUid ||
              item.id === record.studentUid,
          ) || studentById.get(String(record.studentId || ""));
        const name =
          record.studentName || record.student || studentNameOf(student || {});
        return `${name} ${record.studentId || ""} ${record.company || ""}`
          .toLowerCase()
          .includes(query);
      })
      .sort((left, right) =>
        `${attendanceDate(right)}${right.updatedAt?.seconds || ""}`.localeCompare(
          `${attendanceDate(left)}${left.updatedAt?.seconds || ""}`,
        ),
      );
  }, [dateFilter, records, search, studentById, students]);

  const visibleHours = visibleRecords.reduce(
    (total, record) => total + hoursForRecord(record),
    0,
  );
  const visibleStudentCount = new Set(
    visibleRecords.map(
      (record) =>
        record.studentUid ||
        String(record.studentId || record.studentName || record.id),
    ),
  ).size;

  const selectedDtrRecords = useMemo(() => {
    if (!selectedDtr) return [];
    return records
      .filter((record) =>
        selectedDtr.studentUid
          ? record.studentUid === selectedDtr.studentUid
          : selectedDtr.studentId &&
            String(record.studentId || "") === selectedDtr.studentId,
      )
      .sort((left, right) =>
        attendanceDate(right).localeCompare(attendanceDate(left)),
      );
  }, [records, selectedDtr]);

  const selectedStudent = useMemo(
    () =>
      students.find(
        (student) =>
          (selectedDtr?.studentUid &&
            (student.studentUid === selectedDtr.studentUid ||
              student.id === selectedDtr.studentUid)) ||
          (selectedDtr?.studentId &&
            studentIdOf(student) === selectedDtr.studentId),
      ) || {},
    [selectedDtr, students],
  );
  const recordedHours = selectedDtrRecords.reduce(
    (total, record) => total + hoursForRecord(record),
    0,
  );
  const storedCompletedHours = Number(
    selectedStudent.completedHours ??
      selectedStudent.ojtHours ??
      selectedStudent.hoursCompleted ??
      selectedStudent.hours ??
      0,
  );
  const completedHours =
    Number.isFinite(storedCompletedHours) && storedCompletedHours > 0
      ? storedCompletedHours
      : recordedHours;
  const storedRequiredHours = Number(
    selectedStudent.requiredHours ??
      selectedStudent.totalRequiredHours ??
      selectedStudent.ojtRequiredHours ??
      500,
  );
  const requiredHours =
    Number.isFinite(storedRequiredHours) && storedRequiredHours > 0
      ? storedRequiredHours
      : 500;
  const remainingHours = Math.max(0, requiredHours - completedHours);

  useEffect(() => {
    if (!selectedDtr) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setSelectedDtr(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [selectedDtr]);

  const openStudentDtr = (record, student) => {
    const studentId = record.studentId || studentIdOf(student || {});
    setSelectedDtr({
      studentUid: record.studentUid || student?.studentUid || student?.id || "",
      studentId: String(studentId || ""),
      displayName:
        record.studentName ||
        record.student ||
        studentNameOf(student || {}),
    });
  };

  const downloadDtrCsv = () => {
    if (!selectedDtr) return;
    const rows = [
      [
        "Date",
        "AM Time In",
        "AM Time Out",
        "PM Time In",
        "PM Time Out",
        "Overtime Time In",
        "Overtime Time Out",
        "Hours Rendered",
      ],
      ...selectedDtrRecords.map((record) => [
        attendanceDate(record),
        attendanceTime(record, "amIn") || "—",
        attendanceTime(record, "amOut") || "—",
        attendanceTime(record, "pmIn") || "—",
        attendanceTime(record, "pmOut") || "—",
        attendanceTime(record, "overtimeIn") || "—",
        attendanceTime(record, "overtimeOut") || "—",
        formatHoursMinutes(hoursForRecord(record)),
      ]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedDtr.displayName.replace(/[^a-z0-9-_]+/gi, "_")}-DTR.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div className="supervisor-page space-y-5 supervisor-attendance-page">
      <PageHeader
        eyebrow="Supervisor workspace · Attendance"
        title="Daily Time Records of Students"
        description="Review daily attendance and open a student's name to view their complete DTR."
      />

      <section
        className="supervisor-attendance-summary"
        aria-label="Attendance summary for selected filters"
      >
        <article>
          <span className="supervisor-attendance-summary-icon blue">
            <ClipboardCheck size={17} aria-hidden="true" />
          </span>
          <div>
            <span>Attendance records</span>
            <strong>{loading ? "—" : visibleRecords.length}</strong>
          </div>
        </article>
        <article>
          <span className="supervisor-attendance-summary-icon teal">
            <UsersRound size={17} aria-hidden="true" />
          </span>
          <div>
            <span>Students listed</span>
            <strong>{loading ? "—" : visibleStudentCount}</strong>
          </div>
        </article>
        <article>
          <span className="supervisor-attendance-summary-icon amber">
            <Clock3 size={17} aria-hidden="true" />
          </span>
          <div>
            <span>Hours rendered</span>
            <strong>{loading ? "—" : formatHoursMinutes(visibleHours)}</strong>
          </div>
        </article>
      </section>

      <section className="supervisor-panel supervisor-table-panel">
        <div className="supervisor-toolbar flex-wrap">
          <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-slate-400">
            <Search size={16} />
            <span className="sr-only">Search attendance records</span>
            <input
              className="min-w-0 flex-1 border-0 p-0 text-sm text-slate-800 outline-none focus:ring-0"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search student name or ID"
            />
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            Date
            <input
              aria-label="Filter attendance records by date"
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
          <table className="supervisor-table supervisor-attendance-table">
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
                  <td className="supervisor-attendance-empty" colSpan={11}>
                    Loading attendance records…
                  </td>
                </tr>
              ) : visibleRecords.length === 0 ? (
                <tr>
                  <td className="supervisor-attendance-empty" colSpan={11}>
                    {error
                      ? "Attendance records are unavailable."
                      : "No attendance records found for this date."}
                  </td>
                </tr>
              ) : (
                visibleRecords.map((record) => {
                  const student =
                    students.find(
                      (item) =>
                        item.studentUid === record.studentUid ||
                        item.id === record.studentUid,
                    ) || studentById.get(String(record.studentId || ""));
                  const { hours, status } = recordSummary(record);
                  return (
                    <tr key={record.id}>
                      <td>{attendanceDate(record) || "—"}</td>
                      <td>
                        <button
                          className="supervisor-dtr-student-link"
                          type="button"
                          onClick={() => openStudentDtr(record, student)}
                          aria-label={`View DTR history for ${record.studentName || record.student || studentNameOf(student || {})}`}
                          title="Open complete DTR history"
                        >
                          {record.studentName ||
                            record.student ||
                            studentNameOf(student || {})}
                        </button>
                      </td>
                      <td>{record.studentId || studentIdOf(student || {}) || "—"}</td>
                      {attendancePeriods.map((item) => (
                        <td key={item.value}>
                          {attendanceTime(record, item.value) || "—"}
                        </td>
                      ))}
                      <td>{formatHoursMinutes(hours)}</td>
                      <td>
                        <span
                          className={`supervisor-status ${status
                            .toLowerCase()
                            .replace(/\s+/g, "-")}`}
                        >
                          {status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <footer className="supervisor-attendance-footer">
          <span>
            Showing {visibleRecords.length} attendance record
            {visibleRecords.length === 1 ? "" : "s"}
          </span>
          <span>
            Total: <strong>{formatHoursMinutes(visibleHours)}</strong>
          </span>
        </footer>
      </section>

      {selectedDtr && (
        <div
          className="supervisor-dtr-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedDtr(null);
          }}
        >
          <section
            className="supervisor-dtr-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="supervisor-dtr-title"
          >
            <header className="supervisor-dtr-header">
              <div>
                <p>Student Daily Time Record</p>
                <h2 id="supervisor-dtr-title">{selectedDtr.displayName}</h2>
              </div>
              <button
                type="button"
                className="supervisor-dtr-close"
                onClick={() => setSelectedDtr(null)}
                aria-label="Close DTR history"
              >
                <X size={20} />
              </button>
            </header>

            <div className="supervisor-dtr-meta">
              <div><span>Student Name</span><strong>{selectedDtr.displayName}</strong></div>
              <div><span>ID Number</span><strong>{selectedDtr.studentId || "—"}</strong></div>
              <div>
                <span>Department / Course</span>
                <strong>
                  {selectedStudent.department ||
                    selectedStudent.course ||
                    selectedStudent.program ||
                    selectedStudent.courseProgram ||
                    "—"}
                </strong>
              </div>
              <div>
                <span>Assigned Company</span>
                <strong>
                  {selectedStudent.company ||
                    selectedStudent.partnerCompany ||
                    selectedStudent.companyName ||
                    selectedDtrRecords.find((record) => record.company)?.company ||
                    "—"}
                </strong>
              </div>
              <div>
                <span>Company Supervisor</span>
                <strong>
                  {selectedStudent.supervisorName ||
                    user?.name ||
                    user?.displayName ||
                    `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
                    "—"}
                </strong>
              </div>
              <div><span>Total OJT Hours Completed</span><strong>{formatHoursMinutes(completedHours)}</strong></div>
              <div><span>Required OJT Hours</span><strong>{formatHoursMinutes(requiredHours)}</strong></div>
              <div><span>Remaining OJT Hours</span><strong>{formatHoursMinutes(remainingHours)}</strong></div>
            </div>

            <div className="supervisor-dtr-actions">
              <button type="button" onClick={() => window.print()}>
                <Printer size={16} />
                Print Report
              </button>
              <button type="button" onClick={downloadDtrCsv}>
                <Download size={16} />
                Download CSV
              </button>
            </div>

            <div className="supervisor-dtr-table-wrap">
              <table className="supervisor-dtr-table">
                <thead>
                  <tr>
                    <th rowSpan={2}>Date</th>
                    {attendanceGroups.map((group) => (
                      <th
                        key={group.value}
                        className="supervisor-dtr-period-heading"
                        colSpan={group.columns.length}
                      >
                        {group.label}
                      </th>
                    ))}
                    <th rowSpan={2}>Hours Rendered</th>
                  </tr>
                  <tr>
                    {attendanceGroups.flatMap((group) =>
                      group.columns.map((column) => (
                        <th
                          key={column.value}
                          className="supervisor-dtr-period-subheading"
                        >
                          {column.label}
                        </th>
                      )),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {selectedDtrRecords.length === 0 ? (
                    <tr><td colSpan={8}>No DTR history is available for this student.</td></tr>
                  ) : (
                    selectedDtrRecords.map((record) => (
                      <tr key={record.id}>
                        <td>{attendanceDate(record) || "—"}</td>
                        <td>{attendanceTime(record, "amIn") || "—"}</td>
                        <td>{attendanceTime(record, "amOut") || "—"}</td>
                        <td>{attendanceTime(record, "pmIn") || "—"}</td>
                        <td>{attendanceTime(record, "pmOut") || "—"}</td>
                        <td>{attendanceTime(record, "overtimeIn") || "—"}</td>
                        <td>{attendanceTime(record, "overtimeOut") || "—"}</td>
                        <td>{formatHoursMinutes(hoursForRecord(record))}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default Attendance;
