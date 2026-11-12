import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Clock3, QrCode, RefreshCw, ShieldCheck } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useAuth } from "../../context/useAuth";
import { issueStudentAttendanceQrToken } from "../../services/attendanceQrService";
import { db } from "../../services/firebase";
import {
  formatHoursMinutes,
  getRecordPeriods,
  summarizeAttendance,
} from "../../services/manualAttendanceService";
import "../../styles/student-portal.css";
import "../../styles/student-attendance-qr.css";

const TOKEN_REFRESH_MS = 25_000;

function getLocalDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatDateLabel(value) {
  if (!value) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function withTimes(record) {
  if (!record) return null;
  const periods = getRecordPeriods(record);
  const summary = summarizeAttendance(periods);
  const status = record.status === "Absent" ? "Absent" : summary.status;
  return { ...record, ...periods, totalHours: summary.totalHours, status };
}

function Attendance() {
  const { user } = useAuth();
  const [dateFilter, setDateFilter] = useState("");
  const [qr, setQr] = useState(null);
  const fullName =
    user?.fullName ||
    user?.name ||
    `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
    "Student";
  const profileStudentId = user?.studentId || user?.studentID || user?.idNumber || "No student ID";
  const profileProgram = user?.course || user?.program || user?.department || "No program";
  const profileSchoolYear = user?.schoolYear || "Not assigned";
  const profileInitials = fullName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "ST";
  const [qrError, setQrError] = useState("");
  const [clockNow, setClockNow] = useState(0);
  const [attendanceState, setAttendanceState] = useState({
    uid: "",
    records: [],
    loading: true,
    error: "",
  });
  const studentUid = user?.uid;
  const currentAttendanceState = attendanceState.uid === studentUid
    ? attendanceState
    : { records: [], loading: Boolean(studentUid), error: "" };
  const attendanceRecords = useMemo(
    () => currentAttendanceState.records.map(withTimes),
    [currentAttendanceState.records],
  );
  const visibleRecords = useMemo(() => {
    return attendanceRecords.filter((record) => !dateFilter || record.date === dateFilter);
  }, [attendanceRecords, dateFilter]);
  const attendanceLoading = currentAttendanceState.loading;
  const attendanceError = currentAttendanceState.error;
  const secondsRemaining = qr
    ? Math.min(30, Math.max(0, Math.ceil((qr.expiresAt - clockNow) / 1000)))
    : 0;
  const qrIsActive = Boolean(qr?.uid === studentUid && qr.token && secondsRemaining > 0);
  const todaysRecords = useMemo(
    () => attendanceRecords.filter((record) => record.date === getLocalDate()),
    [attendanceRecords],
  );
  const todaysAttendance = todaysRecords[0];
  const accumulatedHours = attendanceRecords.reduce(
    (total, record) => total + Number(record.totalHours ?? record.hours ?? 0),
    0,
  );

  useEffect(() => {
    if (!studentUid || user?.role !== "student") return undefined;

    let active = true;
    let issuingToken = false;
    const refreshToken = async () => {
      if (issuingToken) return;
      issuingToken = true;
      setQrError("");
      try {
        const result = await issueStudentAttendanceQrToken(user);
        if (active) {
          setQr({
            uid: studentUid,
            token: result.token,
            studentId: result.studentId,
            expiresAt: result.expiresAt,
          });
        }
      } catch (error) {
        console.error("Unable to generate the student attendance QR code:", error);
        if (active) {
          setQrError(error.message || "The attendance QR code could not be generated.");
        }
      } finally {
        issuingToken = false;
      }
    };

    void refreshToken();
    const refreshInterval = window.setInterval(() => {
      void refreshToken();
    }, TOKEN_REFRESH_MS);

    return () => {
      active = false;
      window.clearInterval(refreshInterval);
    };
  }, [studentUid, user?.role, user]);

  useEffect(() => {
    const countdownInterval = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(countdownInterval);
  }, []);

  useEffect(() => {
    if (!studentUid || user?.role !== "student") return undefined;

    return onSnapshot(
      query(collection(db, "attendance"), where("studentUid", "==", studentUid)),
      (snapshot) => {
        const records = snapshot.docs
          .map((document) => ({ id: document.id, ...document.data() }))
          .sort((left, right) =>
            `${right.date || ""} ${right.updatedAt?.seconds || ""}`.localeCompare(
              `${left.date || ""} ${left.updatedAt?.seconds || ""}`,
            ),
          );
        setAttendanceState({ uid: studentUid, records, loading: false, error: "" });
      },
      (error) => {
        console.error("Unable to load student attendance history:", error);
        setAttendanceState({
          uid: studentUid,
          records: [],
          loading: false,
          error: "Attendance history could not be loaded. Check your Firestore permissions.",
        });
      },
    );
  }, [studentUid, user?.role]);

  return (
    <div className="student-portal-page">
      <header className="student-page-header">
        <div>
          <p className="student-meta">Daily attendance</p>
          <h1>My Attendance</h1>
          <p>Show your current QR code to your OJT supervisor to record attendance. Your assigned coordinator and supervisor can review your attendance history.</p>
        </div>
      </header>

      <section className="student-card" style={{ padding: "28px 26px 18px", background: "#f3f5f8", marginBottom: 20 }}>
        <div className="student-profile-summary" style={{ display: "flex", alignItems: "center", gap: 18, padding: 0, marginBottom: 0 }}>
          <div
            className="student-avatar"
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              fontSize: 24,
              background: "linear-gradient(135deg, #0a66d5, #0d4fb8)",
              color: "#fff",
            }}
          >
            {profileInitials}
          </div>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: "clamp(24px, 3vw, 42px)", fontWeight: 700, color: "#1f2937", letterSpacing: "-0.04em" }}>
              {fullName}
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 8, color: "#4b5563", fontSize: 18 }}>
              <span>{profileStudentId}</span>
              <span style={{ opacity: 0.7 }}>•</span>
              <span>{profileProgram}</span>
            </div>
            <p style={{ marginTop: 10, color: "#374151", fontSize: 18 }}>
              School Year: {profileSchoolYear}
            </p>
          </div>
        </div>
      </section>

      <section className="student-attendance-qr-layout">
        <article className="student-card student-attendance-qr-card">
          <div className="student-attendance-qr-heading">
            <span className="student-attendance-qr-icon"><QrCode size={20} /></span>
            <div>
              <h2>Your Attendance QR Code</h2>
              <p>Keep this page open and let your supervisor scan the code.</p>
            </div>
          </div>

          {qrError && <div className="student-attendance-qr-error" role="alert">{qrError}</div>}
          {qrIsActive ? (
            <div className="student-attendance-qr-code">
              <QRCodeSVG value={qr.token} size={236} level="M" includeMargin />
            </div>
          ) : (
            <div className="student-attendance-qr-placeholder" role="status">
              <QrCode size={36} />
              <span>{qrError ? "QR code unavailable" : "Generating a secure QR code..."}</span>
            </div>
          )}

          <div className="student-attendance-qr-id">
            <span>Student ID</span>
            <strong>{qr?.studentId || user?.studentId || studentUid || "—"}</strong>
            <ShieldCheck size={16} />
          </div>

          <div className="student-attendance-qr-refresh" aria-live="polite">
            <div className="student-attendance-qr-refresh-label">
              <span><Clock3 size={15} /> {qrIsActive ? `Refreshes in ${secondsRemaining}s` : "Refreshing code..."}</span>
              <span><RefreshCw size={13} /> Automatic refresh</span>
            </div>
            <div
              className="student-attendance-qr-progress"
              role="progressbar"
              aria-label="QR code time remaining"
              aria-valuemin="0"
              aria-valuemax="30"
              aria-valuenow={secondsRemaining}
            >
              <span style={{ width: `${(secondsRemaining / 30) * 100}%` }} />
            </div>
          </div>
          <p className="student-attendance-qr-note">
            The signed code expires after 30 seconds and can only record attendance once.
          </p>
        </article>

        <article className="student-card student-attendance-today-card">
          <div className="student-panel-header">
            <div>
              <p className="student-panel-subtitle">Today · {formatDateLabel(getLocalDate())}</p>
              <h2 className="student-panel-title">Attendance Status</h2>
            </div>
            <CalendarClock size={19} color="#2868c7" />
          </div>
          {attendanceLoading ? (
            <p className="student-meta">Loading today’s attendance...</p>
          ) : attendanceError ? (
            <p className="student-attendance-qr-error" role="alert">{attendanceError}</p>
          ) : (
            <div className="student-attendance-today-grid">
              <div>
                <span>AM / IN</span>
                <strong>{todaysAttendance?.amIn || "Not recorded"}</strong>
              </div>
              <div>
                <span>AM / OUT</span>
                <strong>{todaysAttendance?.amOut || "Not recorded"}</strong>
              </div>
              <div>
                <span>PM / IN</span>
                <strong>{todaysAttendance?.pmIn || "Not recorded"}</strong>
              </div>
              <div>
                <span>PM / OUT</span>
                <strong>{todaysAttendance?.pmOut || "Not recorded"}</strong>
              </div>
              <div>
                <span>Overtime / IN</span>
                <strong>{todaysAttendance?.overtimeIn || "Not recorded"}</strong>
              </div>
              <div>
                <span>Overtime / OUT</span>
                <strong>{todaysAttendance?.overtimeOut || "Not recorded"}</strong>
              </div>
              <div>
                <span>Today’s hours</span>
                <strong>{formatHoursMinutes(todaysAttendance?.totalHours ?? todaysAttendance?.hours ?? 0)}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong>{todaysAttendance?.status || "Pending"}</strong>
              </div>
            </div>
          )}
          <div className="student-attendance-accumulated">
            <span>Total recorded hours</span>
            <strong>{formatHoursMinutes(accumulatedHours)}</strong>
          </div>
        </article>
      </section>

      <section className="student-card student-panel student-attendance-history">
        <div className="student-panel-header">
          <div>
            <p className="student-panel-subtitle">History</p>
            <h2 className="student-panel-title">Attendance Records</h2>
          </div>
          <span className="student-attendance-record-count">{visibleRecords.length} records</span>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, margin: "0 0 12px" }}>
          <label className="student-meta" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            Date
            <input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} style={{ minHeight: 38, padding: "0 8px", border: "1px solid #e2e8f0", borderRadius: 8 }} />
            {dateFilter && (
              <button type="button" onClick={() => setDateFilter("")}>Clear</button>
            )}
          </label>
        </div>
        {attendanceError && <p className="student-attendance-qr-error" role="alert">{attendanceError}</p>}
        <div className="student-table-wrap">
          <table className="student-table">
            <thead>
              <tr>
                <th rowSpan={2}>Date</th>
                <th colSpan={2} style={{ textAlign: "center" }}>AM</th>
                <th colSpan={2} style={{ textAlign: "center" }}>PM</th>
                <th colSpan={2} style={{ textAlign: "center" }}>Overtime</th>
                <th rowSpan={2}>Hours</th>
                <th rowSpan={2}>Status</th>
              </tr>
              <tr>
                {["In", "Out", "In", "Out", "In", "Out"].map((label, index) => (
                  <th key={index} style={{ textAlign: "center" }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {attendanceLoading ? (
                <tr><td colSpan="9">Loading attendance records...</td></tr>
              ) : visibleRecords.length === 0 ? (
                <tr><td colSpan="9"><div className="student-empty-state">{attendanceRecords.length ? "No attendance records found." : "No attendance records have been recorded yet."}</div></td></tr>
              ) : (
                visibleRecords.map((record) => (
                  <tr key={record.id}>
                    <td>{formatDateLabel(record.date)}</td>
                    <td>{record.amIn || "—"}</td>
                    <td>{record.amOut || "—"}</td>
                    <td>{record.pmIn || "—"}</td>
                    <td>{record.pmOut || "—"}</td>
                    <td>{record.overtimeIn || "—"}</td>
                    <td>{record.overtimeOut || "—"}</td>
                    <td>{formatHoursMinutes(record.totalHours)}</td>
                    <td>
                      <span className={`status-badge ${record.status === "Present" ? "active" : "pending"}`}>
                        {record.status || "Incomplete"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default Attendance;
