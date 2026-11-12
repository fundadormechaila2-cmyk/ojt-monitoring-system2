import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Clock3, Printer, QrCode, RefreshCw } from "lucide-react";
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
  const [qrError, setQrError] = useState("");
  const [clockNow, setClockNow] = useState(0);
  const [attendanceState, setAttendanceState] = useState({
    uid: "",
    records: [],
    loading: true,
    error: "",
  });
  const [studentRecordState, setStudentRecordState] = useState({
    uid: "",
    record: null,
    error: "",
  });
  const studentUid = user?.uid;
  const studentRecord = studentRecordState.uid === studentUid
    ? studentRecordState.record
    : null;
  const studentRecordError = studentRecordState.uid === studentUid
    ? studentRecordState.error
    : "";
  const attendanceStudentName =
    studentRecord?.fullName ||
    studentRecord?.name ||
    studentRecord?.studentName ||
    `${studentRecord?.firstName || user?.firstName || ""} ${studentRecord?.lastName || user?.lastName || ""}`.trim() ||
    fullName;
  const attendanceStudentId =
    studentRecord?.studentId ||
    studentRecord?.studentID ||
    studentRecord?.idNumber ||
    profileStudentId;
  const attendanceAcademicYear =
    studentRecord?.schoolYear || user?.schoolYear || "Not provided";
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
  const secondsUntilRefresh = qr
    ? Math.min(25, Math.max(0, Math.ceil((qr.expiresAt - 30_000 + TOKEN_REFRESH_MS - clockNow) / 1000)))
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
      query(collection(db, "students"), where("studentUid", "==", studentUid)),
      (snapshot) => {
        const preferredRecord = snapshot.docs.find(
          (document) => document.id === user.studentRecordId,
        ) || snapshot.docs[0];
        setStudentRecordState({
          uid: studentUid,
          record: preferredRecord
            ? { id: preferredRecord.id, ...preferredRecord.data() }
            : null,
          error: "",
        });
      },
      (error) => {
        console.error("Unable to load the student's OJT record:", error);
        setStudentRecordState({
          uid: studentUid,
          record: null,
          error: "Some student details could not be loaded from your OJT record.",
        });
      },
    );
  }, [studentUid, user?.role, user?.studentRecordId]);

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
              <span>{qrError ? "QR code unavailable" : "Generating your QR code..."}</span>
            </div>
          )}

          <div className="student-attendance-qr-id">
            <span>Student ID</span>
            <strong>{qr?.studentId || user?.studentId || studentUid || "—"}</strong>
          </div>

          <div className="student-attendance-qr-refresh" aria-live="polite">
            <div className="student-attendance-qr-refresh-label">
              <span><Clock3 size={15} /> {qrIsActive && secondsUntilRefresh > 0 ? `Refreshes in ${secondsUntilRefresh}s` : "Refreshing code..."}</span>
              <span><RefreshCw size={13} /> Automatic refresh</span>
            </div>
            <div
              className="student-attendance-qr-progress"
              role="progressbar"
              aria-label="QR code time remaining"
              aria-valuemin="0"
              aria-valuemax="25"
              aria-valuenow={secondsUntilRefresh}
            >
              <span style={{ width: `${(secondsUntilRefresh / 25) * 100}%` }} />
            </div>
          </div>
          <p className="student-attendance-qr-note">
            This code refreshes automatically. It is generated on your device and is not digitally signed.
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

      <section className="student-attendance-history">
        <div className="attendance-record-toolbar">
          <div className="attendance-record-toolbar-heading">
            <h2>Attendance History</h2>
            <p>{dateFilter ? "Only the selected date will be printed." : "View and print your OJT attendance record."}</p>
          </div>
          <div className="attendance-record-toolbar-actions">
            <label>
              Filter by date
              <input
                type="date"
                value={dateFilter}
                onChange={(event) => setDateFilter(event.target.value)}
              />
            </label>
            {dateFilter && (
              <button type="button" onClick={() => setDateFilter("")}>
                Clear filter
              </button>
            )}
            <button
              type="button"
              className="attendance-record-print"
              onClick={() => window.print()}
            >
              <Printer size={16} aria-hidden="true" />
              Print Attendance Record
            </button>
          </div>
        </div>

        <div className="attendance-record-paper">
          <header className="attendance-record-heading">
            <h2>OJT STUDENT ATTENDANCE RECORD</h2>
            <div className="attendance-record-student-details">
              <div><span>Student Name</span><strong>{attendanceStudentName}</strong></div>
              <div><span>Student ID Number</span><strong>{attendanceStudentId}</strong></div>
              <div><span>Academic Year</span><strong>{attendanceAcademicYear}</strong></div>
            </div>
          </header>

          {studentRecordError && (
            <p className="attendance-record-error" role="alert">{studentRecordError}</p>
          )}
          {attendanceError && (
            <p className="attendance-record-error" role="alert">{attendanceError}</p>
          )}
          <div
            className="attendance-record-table-wrap"
            role="region"
            aria-label="Attendance record table"
            tabIndex={0}
          >
            <table className="attendance-record-table">
              <colgroup>
                <col className="attendance-record-date-column" />
                <col span={6} />
              </colgroup>
              <thead>
                <tr>
                  <th rowSpan={2}>Date</th>
                  <th colSpan={2}>AM</th>
                  <th colSpan={2}>PM</th>
                  <th colSpan={2}>Overtime</th>
                </tr>
                <tr>
                  {["Time In", "Time Out", "Time In", "Time Out", "Time In", "Time Out"].map((label, index) => (
                    <th key={index}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {attendanceLoading ? (
                  <tr><td colSpan={7}>Loading attendance records...</td></tr>
                ) : visibleRecords.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      {attendanceRecords.length
                        ? "No attendance records found for this date."
                        : "No attendance records have been recorded yet."}
                    </td>
                  </tr>
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
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

export default Attendance;
