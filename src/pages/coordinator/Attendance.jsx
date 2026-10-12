import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { Clock3 } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { db } from "../../services/firebase";
import { PageHeader, SearchBox, Status } from "../supervisor/SupervisorComponents";

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
const attendancePeriods = attendanceGroups.flatMap((group) => group.columns);

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
  const legacyValues = {
    amIn: record.timeIn || record.morningTimeIn,
    amOut: record.morningTimeOut,
    pmIn: record.afternoonTimeIn,
    pmOut: record.timeOut || record.afternoonTimeOut,
    overtimeIn:
      record.overtimeTimeIn || record.overtimeIn || record.overTimeIn || record.otIn,
    overtimeOut:
      record.overtimeTimeOut || record.overtimeOut || record.overTimeOut || record.otOut,
  };
  return record[period] || legacyValues[period] || "";
}

function hoursForRecord(record) {
  const savedHours = Number(record.totalHours ?? record.hours);
  if (Number.isFinite(savedHours)) return savedHours;

  const hoursBetween = (start, end) => {
    const parseTime = (value) => {
      const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(value || "");
      if (!match) return null;

      let hour = Number(match[1]) % 12;
      if (match[3].toUpperCase() === "PM") hour += 12;
      return hour * 60 + Number(match[2]);
    };
    const startMinutes = parseTime(start);
    const endMinutes = parseTime(end);

    return startMinutes === null || endMinutes === null
      ? 0
      : Math.max(0, endMinutes - startMinutes) / 60;
  };

  return (
    hoursBetween(getPeriodTime(record, "amIn"), getPeriodTime(record, "amOut")) +
    hoursBetween(getPeriodTime(record, "pmIn"), getPeriodTime(record, "pmOut")) +
    hoursBetween(
      getPeriodTime(record, "overtimeIn"),
      getPeriodTime(record, "overtimeOut"),
    )
  );
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
          students.find((item) => item.id === record.studentUid);
        return {
          ...record,
          displayName:
            record.studentName || record.student || getStudentName(student || {}),
          displayId: record.studentId || getStudentId(student || {}) || "—",
        };
      })
      .filter((record) =>
        `${record.displayName} ${record.displayId} ${record.company || ""}`
          .toLowerCase()
          .includes(queryText),
      )
      .sort((left, right) =>
        `${right.date || ""}${right.updatedAt?.seconds || ""}`.localeCompare(
          `${left.date || ""}${left.updatedAt?.seconds || ""}`,
        ),
      );
  }, [records, search, selectedDate, studentById, students]);

  return (
    <main className="supervisor-page space-y-6">
      <PageHeader
        eyebrow="Coordinator workspace · Attendance"
        title="Attendance Records"
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
                {attendanceGroups.map((group) => (
                  <th
                    className="text-center"
                    colSpan={group.columns.length}
                    key={group.value}
                  >
                    {group.label}
                  </th>
                ))}
                <th rowSpan={2}>Hours</th>
                <th rowSpan={2}>Status</th>
              </tr>
              <tr>
                {attendanceGroups.flatMap((group) =>
                  group.columns.map((column) => (
                    <th className="text-center" key={`${group.value}-${column.value}`}>
                      {column.label}
                    </th>
                  )),
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="supervisor-empty" colSpan={11}>
                    Loading attendance records...
                  </td>
                </tr>
              ) : visibleRecords.length === 0 ? (
                <tr>
                  <td className="supervisor-empty" colSpan={11}>
                    {error
                      ? "Attendance records are unavailable."
                      : "No attendance records found for this date."}
                  </td>
                </tr>
              ) : (
                visibleRecords.map((record) => (
                  <tr key={record.id}>
                    <td>{attendanceDateOf(record) || "—"}</td>
                    <td><strong>{record.displayName}</strong></td>
                    <td>{record.displayId}</td>
                    {attendancePeriods.map((period) => (
                      <td key={period.value}>{getPeriodTime(record, period.value) || "—"}</td>
                    ))}
                    <td>
                      {hoursForRecord(record).toFixed(2)}
                    </td>
                    <td>
                      <Status value={String(record.status || "Pending")} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <footer className="px-5 py-3 text-xs text-slate-500">
          Showing {visibleRecords.length} attendance record
          {visibleRecords.length === 1 ? "" : "s"}
        </footer>
      </section>

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
