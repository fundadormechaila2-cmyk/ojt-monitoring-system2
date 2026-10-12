import {
  AlertCircle,
  ArrowRight,
  Bell,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileText,
  FolderOpen,
  MapPin,
  Plus,
  Upload,
  UserCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import { db } from "../../services/firebase";
import "../../styles/student-portal.css";

function parseTime(value) {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(value || "");
  if (!match) return null;
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hour += 12;
  return hour * 60 + Number(match[2]);
}

function validHours(record) {
  const hasPeriodData = record.amIn || record.amOut || record.pmIn || record.pmOut ||
    record.morningTimeIn || record.morningTimeOut || record.afternoonTimeIn || record.afternoonTimeOut;
  const sessions = hasPeriodData
    ? [
        [record.amIn || record.morningTimeIn, record.amOut || record.morningTimeOut],
        [record.pmIn || record.afternoonTimeIn, record.pmOut || record.afternoonTimeOut],
      ]
    : [[record.timeIn, record.timeOut]];
  return sessions.reduce((total, [startValue, endValue]) => {
    const start = parseTime(startValue);
    const end = parseTime(endValue);
    return start !== null && end !== null && end > start
      ? total + (end - start) / 60
      : total;
  }, 0);
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

  const studentProfile = { ...user, ...studentRecord };
  const name = studentProfile.name || studentProfile.fullName ||
    `${studentProfile.firstName || ""} ${studentProfile.lastName || ""}`.trim() ||
    user?.email || "Student";
  const requiredHours = Number(studentProfile.requiredHours || studentProfile.totalRequiredHours || 0);
  const completedHours = attendanceRecords.reduce((total, record) => total + validHours(record), 0);
  const remainingHours = Math.max(0, requiredHours - completedHours);
  const progressPercent = requiredHours ? Math.min(100, Math.round((completedHours / requiredHours) * 100)) : 0;
  const attendanceHistory = [...attendanceRecords]
    .sort((left, right) => String(right.date || "").localeCompare(String(left.date || "")))
    .slice(0, 4);
  const recentReports = [];
  const recentDocuments = [];
  const notifications = [];

  const summaryStats = useMemo(
    () => [
      { label: "OJT Status", value: studentProfile.ojtStatus || studentProfile.status || "Not started", trend: "neutral" },
      { label: "Completed Hours", value: `${completedHours.toFixed(2)}h`, trend: "positive" },
      { label: "Attendance", value: `${attendanceRecords.filter((record) => record.status === "Present").length} days`, trend: "neutral" },
      { label: "Remaining", value: `${remainingHours.toFixed(2)}h`, trend: "neutral" },
    ],
    [attendanceRecords, completedHours, remainingHours, studentProfile.ojtStatus, studentProfile.status]
  );

  const handleTimeIn = () => {
    navigate("/Student/attendance");
  };

  const handleTimeOut = () => {
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
          <button type="button" className="student-button secondary" onClick={handleTimeIn}>
            <Clock3 size={15} />
            Time In
          </button>
          <button type="button" className="student-button primary" onClick={handleTimeOut}>
            <CheckCircle2 size={15} />
            Time Out
          </button>
        </div>
      </header>

      <section className="student-overview-grid">
        {summaryStats.map((item) => (
          <div className="student-card student-stat-card" key={item.label}>
            <p className="student-stat-label">{item.label}</p>
            <div className="student-stat-value">
              <strong>{item.value}</strong>
              <span className={`student-stat-trend ${item.trend}`}>{item.trend === "positive" ? "Good" : "Current"}</span>
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
                <strong>{requiredHours || "Not set"}</strong>
              </div>
            </div>
            <div className="student-card student-stat-card">
              <p className="student-stat-label">Completed</p>
              <div className="student-stat-value">
                <strong>{completedHours.toFixed(2)}</strong>
              </div>
            </div>
            <div className="student-card student-stat-card">
              <p className="student-stat-label">Remaining</p>
              <div className="student-stat-value">
                <strong>{remainingHours.toFixed(2)}</strong>
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
              <strong>{attendanceRecords.filter((record) => record.status === "Present").length}</strong>
              <span className="student-meta">Present days</span>
            </div>
            <div className="student-metric-item">
              <strong>Not tracked</strong>
              <span className="student-meta">Absences</span>
            </div>
            <div className="student-metric-item">
              <strong>Not tracked</strong>
              <span className="student-meta">Late arrivals</span>
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
            <ArrowRight size={18} color="#2868c7" />
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
                  <td>{record.amIn || record.timeIn || record.morningTimeIn || "—"}</td>
                  <td>{record.pmOut || record.timeOut || record.afternoonTimeOut || "—"}</td>
                  <td>
                    <span className={
                      record.status === "Present" ? "status-badge active" : "status-badge pending"
                    }>
                      {record.status || (validHours(record) ? "Present" : "Incomplete")}
                    </span>
                  </td>
                </tr>
              ))}
              {!loading && attendanceHistory.length === 0 && <tr><td colSpan="4">No attendance records yet.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="student-card student-panel">
          <div className="student-panel-header">
            <div>
              <p className="student-panel-subtitle">Submitted work</p>
              <h2 className="student-panel-title">Recent Reports</h2>
            </div>
            <FileText size={18} color="#2868c7" />
          </div>

          <ul className="student-notification-list">
            {recentReports.map((report) => (
              <li key={report.title}>
                <div className="student-notification-item">
                  <strong>{report.title}</strong>
                  <span>{report.submitted}</span>
                </div>
                <span className={
                  report.status === "Approved"
                    ? "status-badge active"
                    : report.status === "Pending"
                      ? "status-badge pending"
                      : "status-badge completed"
                }>
                  {report.status}
                </span>
              </li>
            ))}
            {recentReports.length === 0 && <li>No report records available.</li>}
          </ul>
        </div>
      </section>

      <section className="student-grid-two" style={{ marginTop: "18px" }}>
        <div className="student-card student-panel">
          <div className="student-panel-header">
            <div>
              <p className="student-panel-subtitle">Files</p>
              <h2 className="student-panel-title">Recent Documents</h2>
            </div>
            <FolderOpen size={18} color="#2868c7" />
          </div>

          <ul className="student-notification-list">
            {recentDocuments.map((doc) => (
              <li key={doc.name}>
                <div className="student-notification-item">
                  <strong>{doc.name}</strong>
                  <span>{doc.date}</span>
                </div>
                <span className={
                  doc.status === "Submitted" || doc.status === "Approved"
                    ? "status-badge active"
                    : doc.status === "Pending Review"
                      ? "status-badge pending"
                      : "status-badge completed"
                }>
                  {doc.status}
                </span>
              </li>
            ))}
            {recentDocuments.length === 0 && <li>No document records available.</li>}
          </ul>
        </div>

        <div className="student-card student-panel">
          <div className="student-panel-header">
            <div>
              <p className="student-panel-subtitle">Announcements</p>
              <h2 className="student-panel-title">Notifications</h2>
            </div>
            <AlertCircle size={18} color="#2868c7" />
          </div>

          <ul className="student-notification-list">
            {notifications.map((notify) => (
              <li key={notify.title}>
                <div className="student-notification-item">
                  <strong>{notify.title}</strong>
                  <span>{notify.detail}</span>
                </div>
                <span className={
                  notify.type === "warning" ? "status-badge pending" : notify.type === "success" ? "status-badge active" : "status-badge completed"
                }>
                  {notify.type}
                </span>
              </li>
            ))}
            {notifications.length === 0 && <li>No notifications available.</li>}
          </ul>
        </div>
      </section>

      <section className="student-panel student-card" style={{ marginTop: "18px" }}>
        <div className="student-panel-header">
          <div>
            <p className="student-panel-subtitle">Quick actions</p>
            <h2 className="student-panel-title">Manage your OJT tasks</h2>
          </div>
        </div>

        <div className="student-header-actions">
          <button type="button" className="student-button primary" onClick={handleTimeIn}>
            <Clock3 size={15} /> Time In
          </button>
          <button type="button" className="student-button secondary" onClick={handleTimeOut}>
            <CheckCircle2 size={15} /> Time Out
          </button>
          <button type="button" className="student-button">
            <FileText size={15} /> Submit Report
          </button>
          <button type="button" className="student-button">
            <Upload size={15} /> Upload Document
          </button>
          <button type="button" className="student-button">
            <UserCheck size={15} /> View Progress
          </button>
          <button type="button" className="student-button danger">
            <Plus size={15} /> Add Note
          </button>
        </div>
      </section>
    </div>
  );
}

export default StudentsDashboard;
