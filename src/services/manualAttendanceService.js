import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";

function parseTimeToMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(value || "");
  if (!match) return null;
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hour += 12;
  return hour * 60 + Number(match[2]);
}

export function calculateHours(timeIn, timeOut) {
  const start = parseTimeToMinutes(timeIn);
  const end = parseTimeToMinutes(timeOut);
  return start === null || end === null
    ? 0
    : Number((Math.max(0, end - start) / 60).toFixed(2));
}

export function formatCurrentTime() {
  const now = new Date();
  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${ampm}`;
}

export function getLocalDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export const periodLabels = {
  amIn: "AM / IN",
  amOut: "AM / OUT",
  pmIn: "PM / IN",
  pmOut: "PM / OUT",
};

export async function saveManualAttendance({
  supervisorUid,
  student,
  studentId,
  date,
  period,
}) {
  if (!supervisorUid) {
    throw new Error("You must be logged in as a supervisor.");
  }
  if (!student) {
    throw new Error("Student record was not found among your assigned trainees.");
  }
  if (!date) {
    throw new Error("Date is required.");
  }
  if (!periodLabels[period]) {
    throw new Error("Invalid attendance action selected.");
  }

  const studentUid = student.studentUid || student.userUid || student.id;
  const targetStudentId = String(
    student.studentId || student.studentID || student.idNumber || studentId || "",
  ).trim();
  const studentName =
    student.name ||
    student.fullName ||
    student.studentName ||
    `${student.firstName || ""} ${student.lastName || ""}`.trim() ||
    student.email ||
    "Student";

  const formattedTime = formatCurrentTime();

  // Find if there is an existing attendance record for this student on this date
  const attendanceQuery = query(
    collection(db, "attendance"),
    where("supervisorId", "==", supervisorUid),
    where("date", "==", date),
  );

  const querySnapshot = await getDocs(attendanceQuery);
  const existingDoc = querySnapshot.docs.find((docItem) => {
    const data = docItem.data();
    return (
      (studentUid && data.studentUid === studentUid) ||
      (targetStudentId && String(data.studentId || "").trim() === targetStudentId)
    );
  });

  const previous = existingDoc ? existingDoc.data() : {};

  const existingPeriods = {
    amIn: previous.amIn || previous.morningTimeIn || previous.timeIn || "",
    amOut: previous.amOut || previous.morningTimeOut || "",
    pmIn: previous.pmIn || previous.afternoonTimeIn || "",
    pmOut: previous.pmOut || previous.afternoonTimeOut || previous.timeOut || "",
  };

  if (existingPeriods[period]) {
    throw new Error(
      `${studentName} already has ${periodLabels[period]} recorded for ${date}.`,
    );
  }

  const matchingTimeIn =
    period === "amOut"
      ? existingPeriods.amIn
      : period === "pmOut"
        ? existingPeriods.pmIn
        : null;
  const matchingTimeOut =
    period === "amIn"
      ? existingPeriods.amOut
      : period === "pmIn"
        ? existingPeriods.pmOut
        : null;

  if (period.endsWith("In") && matchingTimeOut) {
    throw new Error(
      `${periodLabels[period]} cannot be recorded after its matching time-out.`,
    );
  }
  if (period.endsWith("Out") && !matchingTimeIn) {
    throw new Error(
      `${periodLabels[period]} requires a matching time-in first.`,
    );
  }
  if (
    period.endsWith("Out") &&
    calculateHours(matchingTimeIn, formattedTime) <= 0
  ) {
    throw new Error("Time-out must be later than its matching time-in.");
  }

  const periods = { ...existingPeriods, [period]: formattedTime };
  const amHours = calculateHours(periods.amIn, periods.amOut);
  const pmHours = calculateHours(periods.pmIn, periods.pmOut);
  const totalHours = Number((amHours + pmHours).toFixed(2));

  const attendanceData = {
    studentUid,
    studentId: targetStudentId,
    studentName,
    coordinatorUid: student.coordinatorUid || previous.coordinatorUid || null,
    supervisorId: supervisorUid,
    date,
    ...periods,
    timeIn: periods.amIn || periods.pmIn || "",
    timeOut: periods.pmOut || periods.amOut || "",
    totalHours,
    hours: totalHours,
    status: "Present",
    lastAttendanceAction: periodLabels[period],
    manualEntry: true,
    updatedAt: serverTimestamp(),
  };

  if (existingDoc) {
    await updateDoc(existingDoc.ref, attendanceData);
  } else {
    const newDocRef = doc(db, "attendance", `${studentUid || targetStudentId}_${date}`);
    await setDoc(newDocRef, {
      ...attendanceData,
      createdAt: serverTimestamp(),
    });
  }

  return {
    studentId: targetStudentId,
    studentName,
    date,
    period: periodLabels[period],
    time: formattedTime,
    totalHours,
  };
}
