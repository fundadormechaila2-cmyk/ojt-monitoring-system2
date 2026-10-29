import {
  Bell,
  CalendarClock,
  Clock3,
  FileText,
  MapPin,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import { db } from "../../services/firebase";
import {
  formatHoursMinutes,
  getRecordPeriods,
  summarizeAttendance,
} from "../../services/manualAttendanceService";
import "../../styles/student-portal.css";

function validHours(record) {
  return summarizeAttendance(getRecordPeriods(record)).totalHours;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function StudentsDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [studentRecord, setStudentRecord] = useState(null);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [journalRecords, setJournalRecords] = useState([]);
  const [journalsLoading, setJournalsLoading] = useState(true);
  const [journalError, setJournalError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!user?.uid) return undefined;
    let studentLoaded = false;
    let attendanceLoaded = false;
    const finishLoading = () => {
      if (studentLoaded && attendanceLoaded) setLoading(false);
    };
    const unsubscribeStudent = onSnapshot(
      query(collection(db, "students"), where("studentUid", "==", user.uid)),
      (snapshot) => {
        setStudentRecord(snapshot.docs[0]
          ? { id: snapshot.docs[0].id, ...snapshot.docs[0].data() }
          : null);
        studentLoaded = true;
        finishLoading();
      },
      (error) => {
        console.error("Unable to load the student roster record:", error);
        setLoadError("Student information could not be loaded.");
        studentLoaded = true;
        finishLoading();
      },
    );
    const unsubscribeAttendance = onSnapshot(
      query(collection(db, "attendance"), where("studentUid", "==", user.uid)),
      (snapshot) => {
        setAttendanceRecords(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
        attendanceLoaded = true;
        finishLoading();
      },
      (error) => {
        console.error("Unable to load student attendance:", error);
        setLoadError("Attendance information could not be loaded.");
        attendanceLoaded = true;
        finishLoading();
      },
    );
    return () => {
      unsubscribeStudent();
      unsubscribeAttendance();
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return undefined;
    return onSnapshot(
      query(collection(db, "journals"), where("studentUid", "==", user.uid)),
      (snapshot) => {
        setJournalRecords(
          snapshot.docs.map((record) => ({ id: record.id, ...record.data() })),
        );
        setJournalError("");
        setJournalsLoading(false);
      },
      (error) => {
        console.error("Unable to load recent student reports:", error);
        setJournalError("Recent reports could not be loaded.");
        setJournalsLoading(false);
      },
    );
  }, [user?.uid]);

  const studentProfile = { ...user, ...studentRecord };
  const name = studentProfile.name || studentProfile.fullName ||
    `${studentProfile.firstName || ""} ${studentProfile.lastName || ""}`.trim() ||
    user?.email || "Student";
  const requiredHours = Number(studentProfile.requiredHours || studentProfile.totalRequiredHours || 0);
  const completedHours = attendanceRecords.reduce((total, record) => total + validHours(record), 0);
  const presentDays = attendanceRecords.filter(
    (record) => summarizeAttendance(getRecordPeriods(record)).status === "Present",
  ).length;
  const remainingHours = Math.max(0, requiredHours - completedHours);
  const progressPercent = requiredHours ? Math.min(100, Math.round((completedHours / requiredHours) * 100)) : 0;
  const attendanceHistory = [...attendanceRecords]
    .sort((left, right) => String(right.date || "").localeCompare(String(left.date || "")))
    .slice(0, 4);
  const recentReports = [...journalRecords]
    .sort((left, right) => {
      const leftDate = String(left.date || "");
      const rightDate = String(right.date || "");
      return rightDate.localeCompare(leftDate);
    })
    .slice(0, 4);

  const summaryStats = useMemo(
    () => [
      { label: "OJT Status", value: studentProfile.ojtStatus || studentProfile.status || "Not started", trend: "neutral" },
      { label: "Completed Hours", value: formatHoursMinutes(completedHours), trend: "positive" },
      { label: "Attendance", value: `${presentDays} days`, trend: "neutral" },
      { label: "Remaining", value: formatHoursMinutes(remainingHours), trend: "neutral" },
    ],
    [completedHours, presentDays, remainingHours, studentProfile.ojtStatus, studentProfile.status]
  );

  const handleTimeIn = () => {
    navigate("/Student/attendance");
  };

  return (
    <div className="student-portal-page">
      {loadError && <p className="student-empty-state" role="alert">{loadError}</p>}
      {loading && <p className="student-meta" role="status">Loading your OJT information...</p>}
      <header className="student-page-header">
        <div>
          <p className="student-meta">Student portal</p>
          <h1>Welcome back, {name.split(" ")[0]}!</h1>
          <p>Track your OJT progress, attendance, and required submissions.</p>
        </div>
        <div className="student-header-actions">
          <button type="button" className="student-button primary" onClick={handleTimeIn}>
            <Clock3 size={15} />
            Record Attendance
          </button>
        </div>
      </header>

      <section className="student-overview-grid">
        {summaryStats.map((item) => (
          <div className="student-card student-stat-card" key={item.label}>
            <p className="student-stat-label">{item.label}</p>
            <div className="student-stat-value">
              <strong>{item.value}</strong>
              {item.trend === "positive" && (
                <span className="student-stat-trend positive">Good</span>
              )}
            </div>
          </div>
        ))}
      </section>

      <section className="student-profile-hero">
        <div className="student-card student-profile-summary">
          <div className="student-avatar">{name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</div>
          <div>
            <div className="student-pills" style={{ marginBottom: "8px" }}>
              <span className="status-badge active">{studentProfile.ojtStatus || studentProfile.status || "OJT"}</span>
            </div>
            <h2>{name}</h2>
            <p>{studentProfile.studentId || "Student ID unavailable"} • {studentProfile.course || studentProfile.program || "Program unavailable"}</p>
            <p>{studentProfile.yearLevel || ""}</p>
          </div>
        </div>

        <div className="student-card student-panel">
          <div className="student-panel-header">
            <div>
              <p className="student-panel-subtitle">Placement details</p>
              <h2 className="student-panel-title">OJT Information</h2>
            </div>
            <MapPin size={18} color="#2868c7" />
          </div>

          <div className="student-metric-list">
            <div className="student-metric-item">
              <strong>{studentProfile.company || "Not assigned"}</strong>
              <span className="student-meta">Company</span>
            </div>
            <div className="student-metric-item">
              <strong>{studentProfile.supervisorName || studentProfile.supervisorUid || "Not assigned"}</strong>
              <span className="student-meta">Supervisor</span>
            </div>
            <div className="student-metric-item">
              <strong>{studentProfile.coordinatorName || studentProfile.coordinatorUid || "Not assigned"}</strong>
              <span className="student-meta">Faculty Coordinator</span>
            </div>
          </div>
        </div>
      </section>

      <section className="student-grid-two">
        <div className="student-card student-panel">
          <div className="student-panel-header">
            <div>
              <p className="student-panel-subtitle">Progress overview</p>
              <h2 className="student-panel-title">Required OJT Hours</h2>
            </div>
            <CalendarClock size={18} color="#2868c7" />
          </div>

          <div className="progress-wrap">
            <div className="progress-label">
              <span>Completed hours</span>
              <strong>{progressPercent}%</strong>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>

          <div className="student-summary-grid" style={{ marginTop: "18px" }}>
            <div className="student-card student-stat-card">
              <p className="student-stat-label">Required</p>
              <div className="student-stat-value">
                <strong>{requiredHours ? formatHoursMinutes(requiredHours) : "Not set"}</strong>
              </div>
            </div>
            <div className="student-card student-stat-card">
              <p className="student-stat-label">Completed</p>
              <div className="student-stat-value">
                <strong>{formatHoursMinutes(completedHours)}</strong>
              </div>
            </div>
            <div className="student-card student-stat-card">
              <p className="student-stat-label">Remaining</p>
              <div className="student-stat-value">
                <strong>{formatHoursMinutes(remainingHours)}</strong>
              </div>
            </div>
          </div>
        </div>

        <div className="student-card student-panel">
          <div className="student-panel-header">
            <div>
              <p className="student-panel-subtitle">Attendance summary</p>
              <h2 className="student-panel-title">Daily Monitoring</h2>
            </div>
            <Bell size={18} color="#2868c7" />
          </div>

          <div className="student-metric-list">
            <div className="student-metric-item">
              <strong>{presentDays}</strong>
              <span className="student-meta">Present days</span>
            </div>
          </div>
        </div>
      </section>

      <section className="student-grid-two" style={{ marginTop: "18px" }}>
        <div className="student-card student-panel">
          <div className="student-panel-header">
            <div>
              <p className="student-panel-subtitle">Recent entries</p>
              <h2 className="student-panel-title">Recent Attendance Records</h2>
            </div>
            <button
              type="button"
              className="student-panel-link"
              onClick={() => navigate("/Student/attendance")}
              aria-label="View all attendance records"
              title="View all attendance records"
            >
              View all
            </button>
          </div>

          <table className="student-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>In (AM)</th>
                <th>Out (PM)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {attendanceHistory.map((record) => (
                <tr key={record.id}>
                  <td>{formatDate(record.date)}</td>
                  <td>{getRecordPeriods(record).amIn || "—"}</td>
                  <td>{getRecordPeriods(record).overtimeOut || getRecordPeriods(record).pmOut || "—"}</td>
                  <td>
                    <span className={
                      summarizeAttendance(getRecordPeriods(record)).status === "Present" ? "status-badge active" : "status-badge pending"
                    }>
                      {summarizeAttendance(getRecordPeriods(record)).status}
                    </span>
                  </td>
                </tr>
              ))}
              {loading && <tr><td colSpan="4">Loading attendance records...</td></tr>}
              {!loading && attendanceHistory.length === 0 && (
                <tr><td colSpan="4">No attendance records yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="student-card student-panel">
          <div className="student-panel-header">
            <div>
              <p className="student-panel-subtitle">Submitted work</p>
              <h2 className="student-panel-title">Recent Reports</h2>
            </div>
            <div className="student-panel-heading-actions">
              <FileText size={18} color="#2868c7" />
              <button
                type="button"
                className="student-panel-link"
                onClick={() => navigate("/Student/ojtreports")}
                aria-label="View all journal reports"
                title="View all reports"
              >
                View all
              </button>
            </div>
          </div>

          <ul className="student-notification-list">
            {journalError && <li className="student-dashboard-error" role="alert">{journalError}</li>}
            {recentReports.map((report) => (
              <li key={report.id}>
                <div className="student-notification-item">
                  <strong>{report.taskPerformed || "Journal report"}</strong>
                  <span>{formatDate(report.date)}</span>
                </div>
                <span className="status-badge active">Submitted</span>
              </li>
            ))}
            {!journalsLoading && !journalError && recentReports.length === 0 && (
              <li>
                <div className="student-notification-item">
                  <strong>No reports submitted yet.</strong>
                  <span>Write a journal report to see it here.</span>
                </div>
                <button
                  type="button"
                  className="student-button primary"
                  onClick={() => navigate("/Student/ojtreports")}
                >
                  Submit report
                </button>
              </li>
            )}
            {journalsLoading && <li>Loading reports...</li>}
          </ul>
        </div>
      </section>

    </div>
  );
}

export default StudentsDashboard;
