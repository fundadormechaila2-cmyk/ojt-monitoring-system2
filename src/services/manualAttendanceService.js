import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "./firebase";

const TIME_ZONE = "Asia/Manila";

export const SESSIONS = [
  { value: "am", label: "AM", inField: "amIn", outField: "amOut" },
  { value: "pm", label: "PM", inField: "pmIn", outField: "pmOut" },
  {
    value: "overtime",
    label: "Overtime",
    inField: "overtimeIn",
    outField: "overtimeOut",
  },
];

// Chronological order of every attendance slot.
const SLOT_ORDER = SESSIONS.flatMap((session) => [
  session.inField,
  session.outField,
]);

export const periodLabels = {
  amIn: "AM / IN",
  amOut: "AM / OUT",
  pmIn: "PM / IN",
  pmOut: "PM / OUT",
  overtimeIn: "Overtime / IN",
  overtimeOut: "Overtime / OUT",
};

export const DEFAULT_SCHEDULE = { pmStart: "12:00", overtimeStart: "17:00" };

export function formatHoursMinutes(value) {
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours <= 0) return "0h 0m";
  const totalMinutes = Math.round(hours * 60);
  return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
}

function parseTimeToMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(value || "");
  if (!match) return null;
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hour += 12;
  return hour * 60 + Number(match[2]);
}

function parseClockToMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value || "");
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

// Hours for one valid In/Out pair; missing or invalid pairs count as 0.
export function calculateHours(timeIn, timeOut) {
  const start = parseTimeToMinutes(timeIn);
  const end = parseTimeToMinutes(timeOut);
  if (start === null || end === null || end <= start) return 0;
  return Number(((end - start) / 60).toFixed(2));
}

export function formatCurrentTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return formatTimeValue(parts);
}

export function getLocalDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatTimeValue(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value || "");
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  const hours = Number(match[1]);
  return `${hours % 12 || 12}:${match[2]} ${hours >= 12 ? "PM" : "AM"}`;
}

// Picks the session for the current Manila time from the configurable schedule.
export function detectSession(schedule = DEFAULT_SCHEDULE, date = new Date()) {
  const now = parseClockToMinutes(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(date),
  );
  const pmStart = parseClockToMinutes(schedule.pmStart) ?? 12 * 60;
  const overtimeStart = parseClockToMinutes(schedule.overtimeStart) ?? 17 * 60;
  if (now >= overtimeStart) return "overtime";
  if (now >= pmStart) return "pm";
  return "am";
}

// Reads all six slots from a record. Legacy timeIn/timeOut are only used for
// old records that have no session fields, so they never leak into AM.
export function getRecordPeriods(record = {}) {
  const hasSessionFields = [
    "amIn",
    "amOut",
    "pmIn",
    "pmOut",
    "overtimeIn",
    "overtimeOut",
    "otIn",
    "otOut",
    "morningTimeIn",
    "morningTimeOut",
    "afternoonTimeIn",
    "afternoonTimeOut",
  ].some((field) => record[field]);
  const legacyIn = hasSessionFields ? "" : record.timeIn || "";
  const legacyOut = hasSessionFields ? "" : record.timeOut || "";
  return {
    amIn: record.amIn || record.morningTimeIn || legacyIn,
    amOut: record.amOut || record.morningTimeOut || "",
    pmIn: record.pmIn || record.afternoonTimeIn || "",
    pmOut: record.pmOut || record.afternoonTimeOut || legacyOut,
    overtimeIn: record.overtimeIn || record.overtimeTimeIn || record.otIn || "",
    overtimeOut:
      record.overtimeOut || record.overtimeTimeOut || record.otOut || "",
  };
}

export function summarizeAttendance(periods) {
  const amHours = calculateHours(periods.amIn, periods.amOut);
  const pmHours = calculateHours(periods.pmIn, periods.pmOut);
  const overtimeHours = calculateHours(periods.overtimeIn, periods.overtimeOut);
  const totalHours = Number((amHours + pmHours + overtimeHours).toFixed(2));
  const hasOpenSession = SESSIONS.some(
    (session) => periods[session.inField] && !periods[session.outField],
  );
  const hasAnyTime = SLOT_ORDER.some((field) => periods[field]);
  const regularComplete = amHours > 0 && pmHours > 0;
  const status = !hasAnyTime
    ? "Incomplete"
    : regularComplete && !hasOpenSession
      ? "Present"
      : "Incomplete";
  return { amHours, pmHours, overtimeHours, totalHours, status };
}

function sessionOf(period) {
  return SESSIONS.find(
    (session) => session.inField === period || session.outField === period,
  );
}

function resolveStudent(student, studentId) {
  const studentUid = student.studentUid || student.userUid || student.id;
  const targetStudentId = String(
    student.studentId ||
      student.studentID ||
      student.idNumber ||
      studentId ||
      "",
  ).trim();
  const studentName =
    student.name ||
    student.fullName ||
    student.studentName ||
    `${student.firstName || ""} ${student.lastName || ""}`.trim() ||
    student.email ||
    "Student";
  return { studentUid, targetStudentId, studentName };
}

// Validates one slot against the existing record and the chronological order.
function validatePeriod({ periods, period, minutes, studentName, date }) {
  if (periods[period]) {
    throw new Error(
      `${studentName} already has ${periodLabels[period]} recorded for ${date}. Duplicate entries are not allowed.`,
    );
  }
  const session = sessionOf(period);
  const isOut = period === session.outField;
  if (isOut && !periods[session.inField]) {
    throw new Error(
      `${periodLabels[period]} requires a ${session.label} time-in first.`,
    );
  }
  if (!isOut && periods[session.outField]) {
    throw new Error(
      `${periodLabels[period]} cannot be recorded after its matching time-out.`,
    );
  }

  const index = SLOT_ORDER.indexOf(period);
  SLOT_ORDER.forEach((field, otherIndex) => {
    const other = parseTimeToMinutes(periods[field]);
    if (other === null || otherIndex === index) return;
    if (otherIndex < index && minutes < other) {
      throw new Error(
        `${periodLabels[period]} cannot be earlier than ${periodLabels[field]} (${periods[field]}).`,
      );
    }
    if (otherIndex > index && minutes > other) {
      throw new Error(
        `${periodLabels[period]} cannot be later than ${periodLabels[field]} (${periods[field]}).`,
      );
    }
  });
  if (isOut && minutes <= parseTimeToMinutes(periods[session.inField])) {
    throw new Error("Time-out must be later than its matching time-in.");
  }
}

// Chooses the next In/Out action for a session, or explains why none is possible.
function nextPeriodForSession({ periods, session, autoSession, studentName }) {
  const target = SESSIONS.find((item) => item.value === session);
  if (!target) throw new Error("Select AM, PM, or Overtime.");
  if (autoSession) {
    const earlier = SESSIONS.slice(0, SESSIONS.indexOf(target)).find(
      (item) => periods[item.inField] && !periods[item.outField],
    );
    if (earlier) {
      throw new Error(
        `${studentName} still has no ${earlier.label} time-out. Select the ${earlier.label} session manually to record it.`,
      );
    }
  }
  if (!periods[target.inField]) return target.inField;
  if (!periods[target.outField]) return target.outField;
  throw new Error(
    `${studentName} has already completed the ${target.label} session today.`,
  );
}

export async function saveManualAttendance({
  supervisorUid,
  supervisorName = "",
  student,
  studentId,
  date,
  time,
  period,
  session,
  autoSession = false,
  nonce = "",
}) {
  if (!supervisorUid) {
    throw new Error("You must be logged in as a supervisor.");
  }
  if (!student) {
    throw new Error(
      "Student record was not found among your assigned trainees.",
    );
  }
  if (!date) {
    throw new Error("Date is required.");
  }
  if (date > getLocalDate()) {
    throw new Error("Attendance cannot be recorded for a future date.");
  }
  const formattedTime = time ? formatTimeValue(time) : formatCurrentTime();
  if (!formattedTime) {
    throw new Error("Enter a valid time.");
  }
  if (period && !periodLabels[period]) {
    throw new Error("Invalid attendance action selected.");
  }
  if (!period && !session) {
    throw new Error("Select an attendance session.");
  }

  const { studentUid, targetStudentId, studentName } = resolveStudent(
    student,
    studentId,
  );
  if (!studentUid && !targetStudentId) {
    throw new Error("The student record has no ID.");
  }

  // Reuse an existing record for this student/date, whatever its document id.
  const snapshot = await getDocs(
    query(
      collection(db, "attendance"),
      where("supervisorId", "==", supervisorUid),
      where("date", "==", date),
    ),
  );
  const existing = snapshot.docs.find((item) => {
    const data = item.data();
    return (
      (studentUid && data.studentUid === studentUid) ||
      (targetStudentId &&
        String(data.studentId || "").trim() === targetStudentId)
    );
  });
  let coordinatorUid = student.coordinatorUid || "";
  if (!coordinatorUid && studentUid) {
    const studentProfile = await getDoc(doc(db, "users", studentUid));
    if (studentProfile.exists()) {
      coordinatorUid = studentProfile.data().coordinatorUid || "";
    }
  }
  coordinatorUid ||= existing?.data().coordinatorUid || "";
  if (!coordinatorUid) {
    throw new Error(
      "This student is not linked to an OJT coordinator. Assign a coordinator before recording attendance.",
    );
  }

  const ref =
    existing?.ref ||
    doc(db, "attendance", `${studentUid || targetStudentId}_${date}`);
  const minutes = parseTimeToMinutes(formattedTime);

  // The transaction re-reads the record, so simultaneous scans cannot
  // overwrite each other's session fields.
  return runTransaction(db, async (transaction) => {
    const current = await transaction.get(ref);
    const previous = current.exists() ? current.data() : {};
    const periods = getRecordPeriods(previous);

    if (nonce && previous.lastScanNonce === nonce) {
      throw new Error(
        "This QR code was already scanned. Ask the student to refresh it.",
      );
    }

    const targetPeriod =
      period ||
      nextPeriodForSession({ periods, session, autoSession, studentName });
    validatePeriod({
      periods,
      period: targetPeriod,
      minutes,
      studentName,
      date,
    });

    const updated = { ...periods, [targetPeriod]: formattedTime };
    const summary = summarizeAttendance(updated);
    const latestOut =
      updated.overtimeOut || updated.pmOut || updated.amOut || "";

    const data = {
      studentUid: studentUid || null,
      studentId: targetStudentId,
      studentName,
      coordinatorUid,
      coordinatorName:
        student.coordinatorName || previous.coordinatorName || "",
      department:
        student.department || student.course || previous.department || "",
      supervisorId: supervisorUid,
      supervisorName: supervisorName || previous.supervisorName || "",
      date,
      ...updated,
      timeIn: updated.amIn || updated.pmIn || updated.overtimeIn || "",
      timeOut: latestOut,
      amHours: summary.amHours,
      pmHours: summary.pmHours,
      overtimeHours: summary.overtimeHours,
      totalHours: summary.totalHours,
      hours: summary.totalHours,
      status: summary.status,
      lastAttendanceAction: periodLabels[targetPeriod],
      manualEntry: !nonce,
      updatedAt: serverTimestamp(),
    };
    if (nonce) data.lastScanNonce = nonce;
    if (!current.exists()) data.createdAt = serverTimestamp();

    transaction.set(ref, data, { merge: true });

    return {
      studentId: targetStudentId,
      studentName,
      date,
      period: periodLabels[targetPeriod],
      time: formattedTime,
      totalHours: summary.totalHours,
      status: summary.status,
    };
  });
}
