import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import {
  AlertCircle,
  CalendarDays,
  Camera,
  CameraOff,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  QrCode,
  ScanLine,
} from "lucide-react";
import { db } from "../../services/firebase";
import { useAuth } from "../../context/useAuth";
import {
  recordManualStudentAttendance,
  scanStudentAttendanceQr,
} from "../../services/attendanceQrService";
import { PageHeader } from "./SupervisorComponents";
import "../../styles/supervisor-student-qr.css";

const SupervisorStudentQrScanner = lazy(() => import("./SupervisorStudentQrScanner"));

const attendancePeriods = [
  { value: "amIn", label: "AM / IN" },
  { value: "amOut", label: "AM / OUT" },
  { value: "pmIn", label: "PM / IN" },
  { value: "pmOut", label: "PM / OUT" },
];

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

function ScanStudentQR() {
  const { user } = useAuth();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [manualFeedback, setManualFeedback] = useState(null);
  const [studentId, setStudentId] = useState("");
  const [manualDate, setManualDate] = useState(getLocalDate);
  const [period, setPeriod] = useState("amIn");
  const [savingManual, setSavingManual] = useState(false);

  useEffect(() => {
    if (!user?.uid) return undefined;
    return onSnapshot(
      query(
        collection(db, "students"),
        where("supervisorUid", "==", user.uid),
      ),
      (snapshot) => {
        setStudents(
          snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
        );
        setStudentsLoading(false);
      },
      (snapshotError) => {
        console.error("Unable to load students for manual attendance:", snapshotError);
        setStudentsLoading(false);
        setManualFeedback({
          type: "error",
          text: "Student records could not be loaded. Check Firestore permissions.",
        });
      },
    );
  }, [user?.uid]);

  const handleScan = useCallback(async (token) => {
    setScannerOpen(false);
    setProcessing(true);
    setFeedback(null);

    try {
      const result = await scanStudentAttendanceQr(token);
      setFeedback({
        type: "success",
        text: result.alreadyRecorded
          ? `${result.studentName} was already recorded for ${result.action} at ${result.time}.`
          : `${result.action} recorded for ${result.studentName} at ${result.time}.`,
      });
    } catch (error) {
      console.error("Unable to validate the scanned student QR code:", error);
      setFeedback({
        type: "error",
        text: error.message || "The scanned QR code could not be validated. Ask the student to refresh their code.",
      });
    } finally {
      setProcessing(false);
    }
  }, []);

  const handleScannerError = useCallback((message) => {
    setFeedback({ type: "error", text: message });
  }, []);

  const handleManualSubmit = async (event) => {
    event.preventDefault();
    setManualFeedback(null);

    if (!studentId.trim() || !manualDate) {
      setManualFeedback({
        type: "error",
        text: "Enter a student ID, date, and attendance time.",
      });
      return;
    }

    setSavingManual(true);
    try {
      const result = await recordManualStudentAttendance({
        studentId: studentId.trim(),
        date: manualDate,
        period,
      });
      setManualFeedback({
        type: "success",
        text: `${result.period} recorded for ${result.studentName} at ${result.time}.`,
      });
      setStudentId("");
    } catch (error) {
      console.error("Unable to manually record attendance:", error);
      setManualFeedback({
        type: "error",
        text: error.message || "Manual attendance could not be recorded.",
      });
    } finally {
      setSavingManual(false);
    }
  };

  return (
    <div className="supervisor-page supervisor-student-qr-page">
      <PageHeader
        eyebrow="Supervisor workspace · Attendance"
        title="Scan Student QR"
        description="Scan the signed QR code displayed in a student’s My Attendance page to record Time-In or Time-Out."
      />

      <section className="supervisor-student-qr-layout">
        <article className="supervisor-panel supervisor-student-qr-panel">
          <div className="supervisor-student-qr-heading">
            <span className="supervisor-student-qr-icon"><ScanLine size={20} /></span>
            <div>
              <h2>Student Attendance Scanner</h2>
              <p>Each code expires in 30 seconds and can only be used once.</p>
            </div>
          </div>

          <div className="supervisor-student-qr-actions">
            <button
              type="button"
              className="supervisor-primary"
              onClick={() => {
                setFeedback(null);
                setScannerOpen((open) => !open);
              }}
              disabled={processing}
            >
              {scannerOpen ? <CameraOff size={16} /> : <Camera size={16} />}
              {scannerOpen ? "Close camera" : "Open camera scanner"}
            </button>
            {processing && <span role="status">Validating attendance...</span>}
          </div>

          {feedback && (
            <div className={`supervisor-student-qr-feedback ${feedback.type}`} role={feedback.type === "error" ? "alert" : "status"}>
              {feedback.type === "success" ? <CheckCircle2 size={17} /> : <QrCode size={17} />}
              <span>{feedback.text}</span>
            </div>
          )}

          {scannerOpen && (
            <Suspense fallback={<p className="supervisor-muted" role="status">Loading camera scanner...</p>}>
              <SupervisorStudentQrScanner
                onScan={handleScan}
                onScannerError={handleScannerError}
              />
            </Suspense>
          )}

          {!scannerOpen && !feedback && (
            <div className="supervisor-student-qr-help">
              <QrCode size={32} />
              <strong>Ready to scan</strong>
              <span>Open the camera, then point it at the student’s QR code.</span>
            </div>
          )}

          <div className="mt-6 border-t border-slate-200 pt-5">
            <div className="mb-4 flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-teal-50 text-teal-700">
                <ClipboardCheck size={20} />
              </span>
              <div>
                <h2 className="m-0 text-lg font-bold text-slate-900">
                  Manual Recording
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Record attendance for today when a student cannot scan a QR code. The server supplies the timestamp.
                </p>
              </div>
            </div>

            {manualFeedback && (
              <div
                className={`mb-4 flex items-start gap-2 rounded-xl border p-3 text-sm ${
                  manualFeedback.type === "error"
                    ? "border-rose-200 bg-rose-50 text-rose-800"
                    : "border-emerald-200 bg-emerald-50 text-emerald-800"
                }`}
                role={manualFeedback.type === "error" ? "alert" : "status"}
              >
                {manualFeedback.type === "error" ? (
                  <AlertCircle className="mt-0.5 shrink-0" size={17} />
                ) : (
                  <CheckCircle2 className="mt-0.5 shrink-0" size={17} />
                )}
                <span>{manualFeedback.text}</span>
              </div>
            )}

            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={handleManualSubmit}
            >
              <label className="grid content-start gap-1.5 text-xs font-bold text-slate-600">
                ID Number
                <input
                  className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-normal text-slate-800 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
                  list="manual-attendance-student-ids"
                  value={studentId}
                  onChange={(event) => setStudentId(event.target.value)}
                  placeholder="Student ID"
                  autoComplete="off"
                  required
                />
                <datalist id="manual-attendance-student-ids">
                  {students.map((student) => (
                    <option key={student.id} value={studentIdOf(student)}>
                      {studentNameOf(student)}
                    </option>
                  ))}
                </datalist>
              </label>

              <label className="grid content-start gap-1.5 text-xs font-bold text-slate-600">
                Date
                <span className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-slate-400 focus-within:border-teal-500 focus-within:ring-4 focus-within:ring-teal-100">
                  <CalendarDays size={16} />
                  <input
                    className="min-w-0 flex-1 border-0 p-0 text-sm font-normal text-slate-800 outline-none focus:ring-0"
                    type="date"
                    value={manualDate}
                    onChange={(event) => setManualDate(event.target.value)}
                    min={getLocalDate()}
                    max={getLocalDate()}
                    required
                  />
                </span>
              </label>

              <label className="grid content-start gap-1.5 text-xs font-bold text-slate-600">
                Attendance action
                <select
                  className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
                  value={period}
                  onChange={(event) => setPeriod(event.target.value)}
                >
                  {attendancePeriods.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid content-start gap-1.5 text-xs font-bold text-slate-600">
                Server time
                <span className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-slate-400 focus-within:border-teal-500 focus-within:ring-4 focus-within:ring-teal-100">
                  <Clock3 size={16} />
                  <input
                    className="min-w-0 flex-1 border-0 p-0 text-sm font-normal text-slate-800 outline-none focus:ring-0"
                    type="text"
                    value="Set when recorded"
                    readOnly
                  />
                </span>
              </label>

              <button
                className="supervisor-primary min-h-10 justify-center bg-teal-700 hover:bg-teal-800 disabled:cursor-wait disabled:opacity-60 sm:col-span-2"
                type="submit"
                disabled={savingManual || studentsLoading}
              >
                <ClipboardCheck size={16} />
                {savingManual ? "Saving..." : "Record attendance"}
              </button>
            </form>
          </div>
        </article>
      </section>
    </div>
  );
}

export default ScanStudentQR;
