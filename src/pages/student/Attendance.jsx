import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Clock3, QrCode, RefreshCw } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useAuth } from "../../context/useAuth";
import { issueStudentAttendanceQrToken } from "../../services/attendanceQrService";
import { db } from "../../services/firebase";
import AttendanceRecord from "../../components/AttendanceRecord";
import { formatAttendanceDate, sortAttendanceRecords, withAttendanceTimes } from "../../services/attendanceRecord";
import {
  formatHoursMinutes,
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

function Attendance() {
  const { user } = useAuth();
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
    () => currentAttendanceState.records.map(withAttendanceTimes),
    [currentAttendanceState.records],
  );
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
        const records = sortAttendanceRecords(
          snapshot.docs.map((document) => ({ id: document.id, ...document.data() })),
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
              <p className="student-panel-subtitle">Today · {formatAttendanceDate(getLocalDate())}</p>
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

      <AttendanceRecord
        studentName={attendanceStudentName}
        studentId={attendanceStudentId}
        academicYear={attendanceAcademicYear}
        records={attendanceRecords}
        loading={attendanceLoading}
        error={attendanceError}
        studentRecordError={studentRecordError}
      />
    </div>
  );
}

export default Attendance;
