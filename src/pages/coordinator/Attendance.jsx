import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { Clock3, Download, Printer, X } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { db } from "../../services/firebase";
import { getRecordPeriods, summarizeAttendance } from "../../services/manualAttendanceService";
import { PageHeader, SearchBox, Status } from "../supervisor/SupervisorComponents";
import "../../styles/coordinator-module.css";

const recentLoginLimit = 8;
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
function getLocalDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getStudentName(student) {
  return (
    student.name ||
    student.fullName ||
    student.studentName ||
    `${student.firstName || ""} ${student.lastName || ""}`.trim() ||
    "Unnamed student"
  );
}

function getStudentId(student) {
  return String(
    student.studentId ||
      student.studentID ||
      student.idNumber ||
      student.id ||
      "",
  );
}

function attendanceDateOf(record) {
  if (typeof record.date === "string") {
    return record.date.slice(0, 10);
  }

  const date = record.date?.toDate?.() || record.date;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getPeriodTime(record, period) {
  return getRecordPeriods(record)[period] || "";
}

function hoursForRecord(record) {
  return summarizeAttendance(getRecordPeriods(record)).totalHours;
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function statusForRecord(record) {
  return record.status === "Absent"
    ? "Absent"
    : summarizeAttendance(getRecordPeriods(record)).status;
}

function loginTimeLabel(timestamp) {
  const date = timestamp?.toDate?.() || (timestamp ? new Date(timestamp) : null);
  if (!date || Number.isNaN(date.getTime())) return "Time unavailable";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function Attendance() {
  const { user } = useAuth();
  const [students, setStudents] = useState([]);
  const [records, setRecords] = useState([]);
  const [loginActivity, setLoginActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loginActivityError, setLoginActivityError] = useState("");
  const [loginActivityLoading, setLoginActivityLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(getLocalDate);
  const [search, setSearch] = useState("");
  const [selectedDtr, setSelectedDtr] = useState(null);

  useEffect(() => {
    let studentsLoaded = false;
    let attendanceLoaded = false;
    const finishLoading = () => {
      if (studentsLoaded && attendanceLoaded) setLoading(false);
    };

    const unsubscribeStudents = onSnapshot(
      query(
        collection(db, "students"),
        where("coordinatorUid", "==", user.uid),
      ),
      (snapshot) => {
        setStudents(
          snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
        );
        studentsLoaded = true;
        finishLoading();
      },
      (snapshotError) => {
        console.error("Unable to load students for attendance:", snapshotError);
        setError("Student records could not be loaded. Check Firestore permissions.");
        studentsLoaded = true;
        finishLoading();
      },
    );
    const unsubscribeAttendance = onSnapshot(
      query(
        collection(db, "attendance"),
        where("coordinatorUid", "==", user.uid),
      ),
      (snapshot) => {
        setRecords(
          snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
        );
        attendanceLoaded = true;
        finishLoading();
      },
      (snapshotError) => {
        console.error("Unable to load attendance records:", snapshotError);
        setError("Attendance records could not be loaded. Check Firestore permissions.");
        attendanceLoaded = true;
        finishLoading();
      },
    );
    const unsubscribeLoginActivity = onSnapshot(
      query(
        collection(db, "studentLoginActivity"),
        where("coordinatorUid", "==", user.uid),
      ),
      (snapshot) => {
        setLoginActivity(
          snapshot.docs
            .map((item) => ({ id: item.id, ...item.data() }))
            .sort(
              (left, right) =>
                (right.loggedInAt?.seconds || 0) -
                (left.loggedInAt?.seconds || 0),
            )
            .slice(0, recentLoginLimit),
        );
        setLoginActivityLoading(false);
        setLoginActivityError("");
      },
      (snapshotError) => {
        console.error("Unable to load student sign-in activity:", snapshotError);
        setLoginActivityLoading(false);
        setLoginActivityError(
          "Student sign-ins could not be loaded. Check Firestore permissions.",
        );
      },
    );

    return () => {
      unsubscribeStudents();
      unsubscribeAttendance();
      unsubscribeLoginActivity();
    };
  }, [user.uid]);

  const studentById = useMemo(
    () => new Map(students.map((student) => [getStudentId(student), student])),
    [students],
  );
  const visibleRecords = useMemo(() => {
    const queryText = search.trim().toLowerCase();

    return records
      .filter((record) => attendanceDateOf(record) === selectedDate)
      .map((record) => {
        const student =
          studentById.get(String(record.studentId || "")) ||
          students.find(
            (item) =>
              item.studentUid === record.studentUid ||
              item.id === record.studentUid,
          );
        return {
          ...record,
          studentRecord: student || {},
          displayName:
            record.studentName || record.student || getStudentName(student || {}),
          displayId: record.studentId || getStudentId(student || {}) || "—",
          displayDepartment:
            record.department || student?.department || student?.course || "—",
        };
      })
      .filter((record) =>
        `${record.displayName} ${record.displayId} ${record.displayDepartment} ${record.company || ""}`
          .toLowerCase()
          .includes(queryText),
      )
      .sort((left, right) =>
        `${right.date || ""}${right.updatedAt?.seconds || ""}`.localeCompare(
          `${left.date || ""}${left.updatedAt?.seconds || ""}`,
        ),
      );
  }, [records, search, selectedDate, studentById, students]);

  const selectedDtrRecords = useMemo(() => {
    if (!selectedDtr) return [];
    return records
      .filter(
        (record) =>
          selectedDtr.studentUid
            ? record.studentUid === selectedDtr.studentUid
            : selectedDtr.studentId &&
              String(record.studentId || "") === selectedDtr.studentId,
      )
      .sort((left, right) =>
        attendanceDateOf(right).localeCompare(attendanceDateOf(left)),
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
            getStudentId(student) === selectedDtr.studentId),
      ) || {},
    [selectedDtr, students],
  );

  const selectedDtrRecordedHours = selectedDtrRecords
    .reduce((sum, record) => sum + hoursForRecord(record), 0)
    .toFixed(2);
  const savedCompletedHours = Number(
    selectedStudent.completedHours ??
      selectedStudent.ojtHours ??
      selectedStudent.hoursCompleted ??
      selectedStudent.hours ??
      0,
  );
  const selectedDtrCompletedHours =
    Number.isFinite(savedCompletedHours) && savedCompletedHours > 0
      ? savedCompletedHours
      : Number(selectedDtrRecordedHours);
  const savedRequiredHours = Number(
    selectedStudent.requiredHours ??
      selectedStudent.totalRequiredHours ??
      selectedStudent.ojtRequiredHours ??
      500,
  );
  const selectedDtrRequiredHours =
    Number.isFinite(savedRequiredHours) && savedRequiredHours > 0
      ? savedRequiredHours
      : 500;
  const selectedDtrRemainingHours = Math.max(
    0,
    selectedDtrRequiredHours - selectedDtrCompletedHours,
  );

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
        attendanceDateOf(record),
        getPeriodTime(record, "amIn") || "—",
        getPeriodTime(record, "amOut") || "—",
        getPeriodTime(record, "pmIn") || "—",
        getPeriodTime(record, "pmOut") || "—",
        getPeriodTime(record, "overtimeIn") || "—",
        getPeriodTime(record, "overtimeOut") || "—",
        hoursForRecord(record).toFixed(2),
      ]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedDtr.displayName.replace(/[^a-z0-9-_]+/gi, "_")}-DTR.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const openStudentDtr = (record) => {
    setSelectedDtr({
    studentUid: record.studentUid || "",
    studentId: String(record.displayId === "—" ? "" : record.displayId),
    displayName: record.displayName,
    displayId: record.displayId,
    department:
      record.displayDepartment ||
      record.studentRecord?.department ||
      record.studentRecord?.course ||
      record.studentRecord?.program ||
      record.studentRecord?.courseProgram ||
      "—",
    company:
      record.company ||
      record.studentRecord?.company ||
      record.studentRecord?.partnerCompany ||
      record.studentRecord?.companyName ||
      "—",
    supervisorName:
      record.supervisorName ||
      record.studentRecord?.supervisorName ||
      record.studentRecord?.supervisor ||
      record.studentRecord?.companySupervisor ||
      "—",
    });
  };

  return (
    <main className="supervisor-page space-y-6 coordinator-attendance-page">
      <PageHeader
        eyebrow="Coordinator workspace · Attendance"
        title="Daily Time Records of Students"
        description="Review student attendance records by date and search."
      />

      {error && (
        <p className="supervisor-error" role="alert">
          {error}
        </p>
      )}

      <section className="supervisor-panel supervisor-table-panel">
        <div className="supervisor-toolbar">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search student name or ID"
          />
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            Date
            <input
              aria-label="Filter attendance by date"
              className="supervisor-select"
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
            />
          </label>
        </div>

        <div className="supervisor-table-wrap">
          <table className="supervisor-table">
            <thead>
              <tr>
                <th rowSpan={2}>Date</th>
                <th rowSpan={2}>Student</th>
                <th rowSpan={2}>ID Number</th>
                <th rowSpan={2}>Department</th>
                <th rowSpan={2}>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="supervisor-empty" colSpan={5}>
                    Loading attendance records...
                  </td>
                </tr>
              ) : visibleRecords.length === 0 ? (
                <tr>
                  <td className="supervisor-empty" colSpan={5}>
                    {error
                      ? "Attendance records are unavailable."
                      : "No attendance records found for this date."}
                  </td>
                </tr>
              ) : (
                visibleRecords.map((record) => (
                  <tr
                    key={record.id}
                    className="coordinator-attendance-clickable-row"
                    onClick={() => openStudentDtr(record)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openStudentDtr(record);
                      }
                    }}
                    tabIndex={0}
                    aria-haspopup="dialog"
                    title="Open student's DTR history"
                  >
                    <td>{attendanceDateOf(record) || "—"}</td>
                    <td>
                      <button
                        type="button"
                        className="coordinator-dtr-student-link"
                        onClick={(event) => {
                          event.stopPropagation();
                          openStudentDtr(record);
                        }}
                      >
                        {record.displayName}
                      </button>
                    </td>
                    <td>{record.displayId}</td>
                    <td>{record.displayDepartment}</td>
                    <td>
                      <Status value={statusForRecord(record)} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <footer className="px-5 py-3 text-xs text-slate-500">
          Showing {visibleRecords.length} attendance record
          {visibleRecords.length === 1 ? "" : "s"} · Total hours{" "}
          {visibleRecords.reduce((sum, record) => sum + hoursForRecord(record), 0).toFixed(2)}h
          {" "}(all dates:{" "}
          {records.reduce((sum, record) => sum + hoursForRecord(record), 0).toFixed(2)}h)
        </footer>
      </section>

      {selectedDtr && (
        <div
          className="coordinator-dtr-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setSelectedDtr(null);
          }}
        >
          <section
            className="coordinator-dtr-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="coordinator-dtr-title"
          >
            <header className="coordinator-dtr-header">
              <div>
                <p>Student Daily Time Record</p>
                <h2 id="coordinator-dtr-title">{selectedDtr.displayName}</h2>
              </div>
              <button
                type="button"
                className="coordinator-dtr-close"
                onClick={() => setSelectedDtr(null)}
                aria-label="Close DTR history"
              >
                <X size={20} />
              </button>
            </header>

            <div className="coordinator-dtr-meta">
              <div>
                <span>Student Name</span>
                <strong>{selectedDtr.displayName}</strong>
              </div>
              <div>
                <span>ID Number</span>
                <strong>{selectedDtr.displayId || "—"}</strong>
              </div>
              <div>
                <span>Department / Course</span>
                <strong>
                  {selectedDtr.department ||
                    selectedStudent.department ||
                    selectedStudent.course ||
                  selectedStudent.program ||
                  selectedStudent.courseProgram ||
                  "—"}
                </strong>
              </div>
              <div>
                <span>Assigned Company</span>
                <strong>
                  {selectedDtr.company ||
                    selectedStudent.company ||
                    selectedStudent.partnerCompany ||
                  selectedStudent.companyName ||
                  "—"}
                </strong>
              </div>
              <div>
                <span>Company Supervisor</span>
                <strong>
                  {selectedDtr.supervisorName ||
                    selectedStudent.supervisorName ||
                    selectedStudent.supervisor ||
                  selectedStudent.companySupervisor ||
                  "—"}
                </strong>
              </div>
              <div>
                <span>Total OJT Hours Completed</span>
                <strong>{selectedDtrCompletedHours.toFixed(2)} hrs</strong>
              </div>
              <div>
                <span>Required OJT Hours</span>
                <strong>{selectedDtrRequiredHours.toFixed(2)} hrs</strong>
              </div>
              <div>
                <span>Remaining OJT Hours</span>
                <strong>{selectedDtrRemainingHours.toFixed(2)} hrs</strong>
              </div>
            </div>

            <div className="coordinator-dtr-actions">
              <button type="button" onClick={() => window.print()}>
                <Printer size={16} />
                Print Report
              </button>
              <button type="button" onClick={downloadDtrCsv}>
                <Download size={16} />
                Download CSV
              </button>
            </div>

            <div className="coordinator-dtr-table-wrap">
              <table className="coordinator-dtr-table">
                <thead>
                  <tr>
                    <th rowSpan={2}>Date</th>
                    {attendanceGroups.map((group) => (
                      <th
                        key={group.value}
                        className="coordinator-dtr-period-heading"
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
                          className="coordinator-dtr-period-subheading"
                        >
                          {column.label}
                        </th>
                      )),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {selectedDtrRecords.length === 0 ? (
                    <tr>
                      <td colSpan={8}>No DTR history is available for this student.</td>
                    </tr>
                  ) : (
                    selectedDtrRecords.map((record) => (
                      <tr key={record.id}>
                        <td>{attendanceDateOf(record) || "—"}</td>
                        <td>{getPeriodTime(record, "amIn") || "—"}</td>
                        <td>{getPeriodTime(record, "amOut") || "—"}</td>
                        <td>{getPeriodTime(record, "pmIn") || "—"}</td>
                        <td>{getPeriodTime(record, "pmOut") || "—"}</td>
                        <td>{getPeriodTime(record, "overtimeIn") || "—"}</td>
                        <td>{getPeriodTime(record, "overtimeOut") || "—"}</td>
                        <td>{hoursForRecord(record).toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      <section className="supervisor-panel">
        <div className="supervisor-panel-heading">
          <div>
            <h2>Recent student sign-ins</h2>
            <p>Latest {recentLoginLimit} student account logins</p>
          </div>
          <Clock3 size={18} className="text-slate-400" aria-hidden="true" />
        </div>

        {loginActivityError ? (
          <p className="supervisor-error" role="alert">{loginActivityError}</p>
        ) : loginActivityLoading ? (
          <p className="supervisor-muted" role="status">Loading student sign-ins...</p>
        ) : loginActivity.length === 0 ? (
          <p className="supervisor-muted">No student sign-ins have been recorded yet.</p>
        ) : (
          <ul className="supervisor-list">
            {loginActivity.map((activity) => (
              <li className="supervisor-list-item" key={activity.id}>
                <div>
                  <strong>{activity.studentName || activity.email || "Student"}</strong>
                  <span>
                    {activity.studentId ? `ID: ${activity.studentId} · ` : ""}
                    {activity.email || "Student account"}
                  </span>
                </div>
                <time className="supervisor-muted">
                  {loginTimeLabel(activity.loggedInAt)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

export default Attendance;
