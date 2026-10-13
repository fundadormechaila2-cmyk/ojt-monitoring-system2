import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import {
  getLocalDate,
  saveManualAttendance,
} from "./manualAttendanceService";

function encodeBase64(str) {
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(Number(`0x${p1}`)),
    ),
  );
}

function decodeBase64(str) {
  return decodeURIComponent(
    Array.prototype.map
      .call(atob(str), (c) => `%${(`00${c.charCodeAt(0).toString(16)}`).slice(-2)}`)
      .join(""),
  );
}

export async function issueStudentAttendanceQrToken(currentUser) {
  const activeUser = currentUser || auth.currentUser;
  if (!activeUser) {
    throw new Error("Sign in as a student to generate your attendance QR code.");
  }

  const studentUid = activeUser.uid;
  let studentId =
    activeUser.studentId ||
    activeUser.studentID ||
    activeUser.idNumber ||
    "";
  let studentName =
    activeUser.name ||
    activeUser.fullName ||
    `${activeUser.firstName || ""} ${activeUser.lastName || ""}`.trim() ||
    activeUser.email ||
    "Student";

  if (!studentId || studentId === studentUid) {
    try {
      const userSnap = await getDoc(doc(db, "users", studentUid));
      if (userSnap.exists()) {
        const uData = userSnap.data();
        if (uData.studentId || uData.idNumber) {
          studentId = uData.studentId || uData.idNumber;
        }
        if (uData.name || uData.fullName) {
          studentName = uData.name || uData.fullName;
        }
      }
    } catch {
      // ignore
    }
  }

  if (!studentId) {
    try {
      const studentQuery = query(
        collection(db, "students"),
        where("studentUid", "==", studentUid),
      );
      const studentSnap = await getDocs(studentQuery);
      if (!studentSnap.empty) {
        const sData = studentSnap.docs[0].data();
        studentId = sData.studentId || sData.idNumber || sData.id || "";
        if (sData.name || sData.studentName) {
          studentName = sData.name || sData.studentName;
        }
      }
    } catch {
      // ignore
    }
  }

  const now = Date.now();
  const expiresAt = now + 30_000;

  const payload = {
    type: "ojt-attendance-qr",
    studentUid,
    studentId: String(studentId || studentUid),
    studentName: String(studentName || "Student"),
    iat: now,
    exp: expiresAt,
    nonce: Math.random().toString(36).substring(2) + Date.now().toString(36),
  };

  const token = encodeBase64(JSON.stringify(payload));

  return {
    token,
    studentId: String(studentId || studentUid),
    expiresAt,
  };
}

export async function scanStudentAttendanceQr(token, options = {}) {
  let payload;
  try {
    try {
      payload = JSON.parse(decodeBase64(token));
    } catch {
      payload = JSON.parse(atob(token));
    }
  } catch {
    try {
      payload = JSON.parse(token);
    } catch {
      throw new Error("The scanned QR code is invalid.");
    }
  }

  if (!payload || payload.type !== "ojt-attendance-qr" || !payload.studentUid) {
    throw new Error("This QR code is not a valid student attendance code.");
  }

  if (payload.exp && Date.now() > payload.exp + 60_000) {
    throw new Error("This student QR code has expired. Ask the student to refresh it.");
  }

  const supervisorUid =
    (typeof options === "string" ? null : options?.supervisorUid) ||
    auth.currentUser?.uid;
  if (!supervisorUid) {
    throw new Error("Sign in as a supervisor to scan student attendance.");
  }

  let studentRecord = null;
  const studentList =
    typeof options === "object" && Array.isArray(options?.students)
      ? options.students
      : null;

  if (studentList) {
    studentRecord = studentList.find((s) => {
      const sId = (s.studentId || s.idNumber || s.id || "").toString().trim().toLowerCase();
      const payloadId = (payload.studentId || "").toString().trim().toLowerCase();
      return (
        s.studentUid === payload.studentUid ||
        s.id === payload.studentUid ||
        (payloadId && sId === payloadId)
      );
    });
  }

  if (!studentRecord) {
    const q = query(
      collection(db, "students"),
      where("supervisorUid", "==", supervisorUid),
    );
    const snap = await getDocs(q);
    const match = snap.docs.find((d) => {
      const data = d.data();
      const sId = (data.studentId || data.idNumber || d.id || "").toString().trim().toLowerCase();
      const payloadId = (payload.studentId || "").toString().trim().toLowerCase();
      return (
        data.studentUid === payload.studentUid ||
        d.id === payload.studentUid ||
        (payloadId && sId === payloadId)
      );
    });
    if (match) {
      studentRecord = { id: match.id, ...match.data() };
    }
  }

  if (!studentRecord) {
    throw new Error(
      `Student ${payload.studentName || payload.studentId} is not assigned to your supervisor account.`,
    );
  }

  const date = getLocalDate();
  const requestedPeriod = typeof options === "string" ? options : options?.period;

  let targetPeriod = requestedPeriod;
  if (!targetPeriod) {
    const attendanceQuery = query(
      collection(db, "attendance"),
      where("supervisorId", "==", supervisorUid),
      where("date", "==", date),
    );
    const snap = await getDocs(attendanceQuery);
    const existingDoc = snap.docs.find((d) => {
      const data = d.data();
      return (
        data.studentUid === payload.studentUid ||
        String(data.studentId || "").trim() === String(payload.studentId || "").trim()
      );
    });
    const previous = existingDoc ? existingDoc.data() : {};
    const existingPeriods = {
      amIn: previous.amIn || previous.morningTimeIn || previous.timeIn || "",
      amOut: previous.amOut || previous.morningTimeOut || "",
      pmIn: previous.pmIn || previous.afternoonTimeIn || "",
      pmOut: previous.pmOut || previous.afternoonTimeOut || previous.timeOut || "",
    };

    const currentHour = new Date().getHours();
    if (!existingPeriods.amIn && currentHour < 12) {
      targetPeriod = "amIn";
    } else if (existingPeriods.amIn && !existingPeriods.amOut) {
      targetPeriod = "amOut";
    } else if (!existingPeriods.pmIn) {
      targetPeriod = "pmIn";
    } else if (existingPeriods.pmIn && !existingPeriods.pmOut) {
      targetPeriod = "pmOut";
    } else if (!existingPeriods.amIn) {
      targetPeriod = "amIn";
    } else {
      throw new Error(`${payload.studentName} has already completed all attendance sessions for today.`);
    }
  }

  const result = await saveManualAttendance({
    supervisorUid,
    student: studentRecord,
    studentId: payload.studentId,
    date,
    period: targetPeriod,
  });

  return {
    studentId: result.studentId,
    studentName: result.studentName,
    action: result.period,
    time: result.time,
    alreadyRecorded: false,
    totalHours: result.totalHours,
  };
}

export async function recordManualStudentAttendance(params) {
  return saveManualAttendance(params);
}
