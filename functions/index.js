const { createHmac, randomBytes, timingSafeEqual } = require("node:crypto");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const { defineSecret } = require("firebase-functions/params");
const { HttpsError, onCall, onRequest } = require("firebase-functions/v2/https");

initializeApp();

const { isAccountLive, isRecordArchived } = require("./accountState");
const { recordDepartmentId, sameDepartment } = require("./departments");
const { handleManageAccount, manageAccount } = require("./accountManagement");
exports.manageAccount = manageAccount;
const {
  createStudentAccount,
  resendStudentAccountNotification,
} = require("./studentRegistration");
exports.createStudentAccount = createStudentAccount;
exports.resendStudentAccountNotification = resendStudentAccountNotification;
exports.mirrorRoleAccount = require("./roleAccountMirror").mirrorRoleAccount;

const accountManagementOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "https://ojt-monitoringsystem2.web.app",
  "https://ojt-monitoringsystem2.firebaseapp.com",
];

exports.manageAccountApi = onRequest(
  { cors: accountManagementOrigins, timeoutSeconds: 540, memory: "1GiB" },
  async (req, res) => {
    if (req.method !== "POST") {
      res.set("Allow", "POST").status(405).json({
        error: { code: "invalid-argument", message: "Use POST for account management." },
      });
      return;
    }

    const authorization = req.get("authorization") || "";
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    if (!match || match[1].length > 8192) {
      res.status(401).json({
        error: { code: "unauthenticated", message: "Sign in to manage accounts." },
      });
      return;
    }

    let decoded;
    try {
      decoded = await getAuth().verifyIdToken(match[1], true);
    } catch (error) {
      if (error.code === "auth/id-token-expired") {
        res.status(401).json({
          error: { code: "token-expired", message: "The Firebase ID token expired." },
        });
        return;
      }
      if ([
        "auth/id-token-revoked",
        "auth/invalid-id-token",
        "auth/invalid-user-token",
        "auth/user-disabled",
        "auth/user-not-found",
      ].includes(error.code)) {
        res.status(401).json({
          error: { code: "unauthenticated", message: "The Firebase session is no longer valid." },
        });
        return;
      }
      console.error("manageAccountApi token verification failed", error);
      res.status(500).json({
        error: { code: "internal", message: "The server could not verify the Firebase ID token." },
      });
      return;
    }

    try {
      const requestData = req.body?.data ?? req.body ?? {};
      const result = await handleManageAccount({
        auth: { uid: decoded.uid, token: decoded },
        data: requestData,
      });
      res.status(200).json({ data: result });
    } catch (error) {
      const code = typeof error.code === "string" && !error.code.includes("/")
        ? error.code
        : "internal";
      const statuses = {
        "unauthenticated": 401,
        "permission-denied": 403,
        "invalid-argument": 400,
        "not-found": 404,
        "failed-precondition": 409,
      };
      if (!statuses[code]) console.error("manageAccountApi operation failed", error);
      res.status(statuses[code] || 500).json({
        error: {
          code: statuses[code] ? code : "internal",
          message: statuses[code] ? error.message : "The account operation did not complete.",
        },
      });
    }
  },
);

const db = getFirestore();
const attendanceQrSecret = defineSecret("ATTENDANCE_QR_SECRET");
const tokenLifetimeSeconds = 30;
const timeZone = "Asia/Manila";

function getLocalDate(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getLocalTime(date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function signToken(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const unsignedToken = `${header}.${body}`;
  const signature = createHmac("sha256", secret).update(unsignedToken).digest("base64url");
  return `${unsignedToken}.${signature}`;
}

function verifyToken(token, secret) {
  if (typeof token !== "string" || token.length > 8192) {
    throw new HttpsError("invalid-argument", "The student attendance QR token is invalid.");
  }

  const [header, body, signature, extra] = token.split(".");
  if (!header || !body || !signature || extra !== undefined) {
    throw new HttpsError("invalid-argument", "The student attendance QR token is invalid.");
  }

  const unsignedToken = `${header}.${body}`;
  const expectedSignature = createHmac("sha256", secret).update(unsignedToken).digest();
  const suppliedSignature = Buffer.from(signature, "base64url");
  if (
    suppliedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(suppliedSignature, expectedSignature)
  ) {
    throw new HttpsError("unauthenticated", "The student attendance QR signature is invalid.");
  }

  try {
    const decodedHeader = JSON.parse(Buffer.from(header, "base64url").toString("utf8"));
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (decodedHeader.alg !== "HS256" || decodedHeader.typ !== "JWT") {
      throw new Error("Invalid token header");
    }
    return payload;
  } catch {
    throw new HttpsError("invalid-argument", "The student attendance QR token is invalid.");
  }
}

async function getUserProfile(uid) {
  const userSnapshot = await db.collection("users").doc(uid).get();
  return userSnapshot.exists ? userSnapshot.data() : null;
}

function getStudentNumber(profile, fallbackId) {
  return profile.studentId || profile.studentID || profile.idNumber || fallbackId;
}

function getStudentName(profile) {
  const name =
    profile.name ||
    profile.fullName ||
    `${profile.firstName || ""} ${profile.lastName || ""}`.trim();
  return name || profile.email || "Student";
}

async function getStudentRecord(studentUid, profile) {
  if (profile.studentRecordId) {
    const linkedRecord = await db.collection("students").doc(profile.studentRecordId).get();
    if (linkedRecord.exists) return linkedRecord.data();
  }

  const matches = await db.collection("students")
    .where("studentUid", "==", studentUid)
    .limit(2)
    .get();
  if (matches.size > 1) {
    throw new HttpsError("failed-precondition", "This student has multiple roster records. Contact an administrator.");
  }
  if (matches.size === 1) return matches.docs[0].data();

  const legacyRecord = await db.collection("students").doc(studentUid).get();
  return legacyRecord.exists ? legacyRecord.data() : null;
}

async function assertSupervisorAssignment(supervisorUid, supervisorProfile, studentUid, studentProfile) {
  if (!isAccountLive(supervisorProfile)) {
    throw new HttpsError("permission-denied", "This supervisor account is inactive.");
  }
  if (!isAccountLive(studentProfile)) {
    throw new HttpsError("failed-precondition", "This student account is inactive or archived.");
  }

  const studentRecord = await getStudentRecord(studentUid, studentProfile);
  if (isRecordArchived(studentRecord)) {
    throw new HttpsError("failed-precondition", "This student record is archived.");
  }
  const assignedSupervisorUid = studentProfile.supervisorUid || studentRecord?.supervisorUid;
  if (assignedSupervisorUid !== supervisorUid) {
    throw new HttpsError("permission-denied", "This student is not assigned to your supervisor account.");
  }

  const coordinatorUid = studentProfile.coordinatorUid || studentRecord?.coordinatorUid;
  const coordinatorProfile = coordinatorUid ? await getUserProfile(coordinatorUid) : null;
  if (
    coordinatorProfile?.role !== "coordinator" ||
    !recordDepartmentId(coordinatorProfile) ||
    !sameDepartment(supervisorProfile, coordinatorProfile)
  ) {
    throw new HttpsError("permission-denied", "The student and supervisor do not share a valid department assignment.");
  }

  return { studentRecord, coordinatorUid };
}

const attendancePeriods = {
  amIn: "AM / IN",
  amOut: "AM / OUT",
  pmIn: "PM / IN",
  pmOut: "PM / OUT",
  otIn: "Overtime / IN",
  otOut: "Overtime / OUT",
};
const periodFields = {
  amIn: ["amIn", "morningTimeIn"],
  amOut: ["amOut", "morningTimeOut"],
  pmIn: ["pmIn", "afternoonTimeIn"],
  pmOut: ["pmOut", "afternoonTimeOut"],
  otIn: ["otIn", "overtimeIn", "overtimeTimeIn"],
  otOut: ["otOut", "overtimeOut", "overtimeTimeOut"],
};

function parseAttendanceTime(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(value);
  if (!match || Number(match[1]) < 1 || Number(match[1]) > 12 || Number(match[2]) > 59) {
    return null;
  }
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hour += 12;
  return hour * 60 + Number(match[2]);
}

function calculateHours(timeIn, timeOut) {
  const start = parseAttendanceTime(timeIn);
  const end = parseAttendanceTime(timeOut);
  return start === null || end === null
    ? 0
    : Number((Math.max(0, end - start) / 60).toFixed(2));
}

function getAttendancePeriods(record) {
  const periods = {};
  for (const [period, fields] of Object.entries(periodFields)) {
    const values = fields.map((field) => record[field]).filter((value) => value !== undefined && value !== null && value !== "");
    if (values.some((value) => parseAttendanceTime(value) === null)) {
      throw new HttpsError("failed-precondition", "An existing attendance time is invalid. Contact an administrator.");
    }
    if (values.some((value) => parseAttendanceTime(value) !== parseAttendanceTime(values[0]))) {
      throw new HttpsError("failed-precondition", "Existing attendance times conflict. Contact an administrator.");
    }
    periods[period] = values[0] || "";
  }

  // Aggregate fields describe a single legacy session only when no period fields exist.
  if (!Object.values(periods).some(Boolean)) {
    periods.amIn = record.timeIn || "";
    periods.amOut = record.timeOut || "";
    if ((periods.amIn && parseAttendanceTime(periods.amIn) === null) ||
        (periods.amOut && parseAttendanceTime(periods.amOut) === null)) {
      throw new HttpsError("failed-precondition", "An existing attendance time is invalid. Contact an administrator.");
    }
  }
  return periods;
}

function updateAttendancePeriods(previous, period, time, studentName, date) {
  const periods = getAttendancePeriods(previous);
  if (periods[period]) {
    throw new HttpsError("failed-precondition", `${studentName} already has ${attendancePeriods[period]} recorded for ${date}.`);
  }

  const matchingPeriod = period.endsWith("Out")
    ? period.replace("Out", "In")
    : period.replace("In", "Out");
  if (period.endsWith("Out") && !periods[matchingPeriod]) {
    throw new HttpsError("failed-precondition", `${attendancePeriods[period]} requires a matching time-in first.`);
  }
  if (period.endsWith("In") && periods[matchingPeriod]) {
    throw new HttpsError("failed-precondition", `${attendancePeriods[period]} cannot be recorded after its matching time-out.`);
  }
  if (period === "otIn" && !periods.pmOut) {
    throw new HttpsError("failed-precondition", "Overtime / IN requires PM / OUT first.");
  }
  for (const [inField, outField] of [["amIn", "amOut"], ["pmIn", "pmOut"], ["otIn", "otOut"]]) {
    if (periods[outField] &&
        (!periods[inField] || parseAttendanceTime(periods[outField]) <= parseAttendanceTime(periods[inField]))) {
      throw new HttpsError("failed-precondition", "An existing attendance session is invalid. Contact an administrator.");
    }
  }
  if (periods.otIn && !periods.pmOut) {
    throw new HttpsError("failed-precondition", "Existing overtime requires PM / OUT. Contact an administrator.");
  }
  const minutes = parseAttendanceTime(time);
  if (minutes === null) {
    throw new HttpsError("internal", "The server could not generate a valid attendance time.");
  }
  if (period.endsWith("Out") && minutes <= parseAttendanceTime(periods[matchingPeriod])) {
    throw new HttpsError("failed-precondition", "Time-out must be later than its matching time-in.");
  }
  const order = Object.keys(attendancePeriods);
  const index = order.indexOf(period);
  let lastTime = -1;
  for (const [otherIndex, field] of order.entries()) {
    if (!periods[field]) continue;
    const otherTime = parseAttendanceTime(periods[field]);
    if (otherTime < lastTime) {
      throw new HttpsError("failed-precondition", "Existing attendance times are out of order. Contact an administrator.");
    }
    lastTime = otherTime;
    if ((otherIndex < index && minutes < otherTime) || (otherIndex > index && minutes > otherTime)) {
      throw new HttpsError("failed-precondition", `${attendancePeriods[period]} conflicts with the order of existing attendance times.`);
    }
  }
  periods[period] = time;
  const totalHours = Number((
    calculateHours(periods.amIn, periods.amOut) +
    calculateHours(periods.pmIn, periods.pmOut) +
    calculateHours(periods.otIn, periods.otOut)
  ).toFixed(2));
  return { periods, totalHours };
}

function findAttendanceRecord(snapshots, date, studentUid) {
  const records = new Map();
  for (const snapshot of snapshots) {
    for (const document of snapshot.docs) {
      const data = document.data();
      if (data.date !== date) continue;
      if (data.studentUid && data.studentUid !== studentUid) {
        throw new HttpsError("failed-precondition", "The student ID matches another attendance record. Contact an administrator.");
      }
      records.set(document.ref.path, document);
    }
  }
  if (records.size > 1) {
    throw new HttpsError("failed-precondition", "Multiple attendance records exist for this student and date. Contact an administrator.");
  }
  return records.values().next().value;
}

exports.issueStudentAttendanceQrToken = onCall(
  { secrets: [attendanceQrSecret] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in as a student to generate your attendance QR code.");
    }

    const studentUid = request.auth.uid;
    const studentProfile = await getUserProfile(studentUid);
    if (studentProfile?.role !== "student") {
      throw new HttpsError("permission-denied", "Only students can generate a student attendance QR code.");
    }
    if (!isAccountLive(studentProfile)) {
      throw new HttpsError("permission-denied", "This student account is inactive or archived.");
    }

    const now = Date.now();
    const issuedAt = Math.floor(now / 1000);
    const expiresAt = now + tokenLifetimeSeconds * 1000;
    const token = signToken(
      {
        iss: "ojt-monitoring-system",
        student_id: studentUid,
        iat: issuedAt,
        exp: Math.floor(expiresAt / 1000),
        nonce: randomBytes(24).toString("base64url"),
      },
      attendanceQrSecret.value(),
    );

    return {
      token,
      studentId: getStudentNumber(studentProfile, studentUid),
      expiresAt,
    };
  },
);

exports.scanStudentAttendanceQr = onCall(
  { secrets: [attendanceQrSecret] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in as a supervisor to scan student attendance.");
    }

    const supervisorUid = request.auth.uid;
    const supervisorProfile = await getUserProfile(supervisorUid);
    if (supervisorProfile?.role !== "supervisor") {
      throw new HttpsError("permission-denied", "Only supervisors can scan student attendance QR codes.");
    }

    const requestedPeriod = request.data?.period;
    if (requestedPeriod !== undefined &&
        (typeof requestedPeriod !== "string" || !Object.hasOwn(attendancePeriods, requestedPeriod))) {
      throw new HttpsError("invalid-argument", "Select a valid attendance period.");
    }

    const payload = verifyToken(request.data?.token, attendanceQrSecret.value());
    const now = Date.now();
    const currentTime = Math.floor(now / 1000);
    if (
      payload.iss !== "ojt-monitoring-system" ||
      typeof payload.student_id !== "string" ||
      typeof payload.nonce !== "string" ||
      payload.nonce.length < 32 ||
      !Number.isInteger(payload.iat) ||
      !Number.isInteger(payload.exp) ||
      payload.iat > currentTime + 5 ||
      payload.exp <= currentTime ||
      payload.exp - payload.iat > tokenLifetimeSeconds
    ) {
      throw new HttpsError("deadline-exceeded", "This student QR code has expired. Ask the student to refresh it.");
    }

    const studentUid = payload.student_id;
    const studentProfile = await getUserProfile(studentUid);
    if (studentProfile?.role !== "student") {
      throw new HttpsError("not-found", "The scanned QR code does not belong to an active student account.");
    }
    const { coordinatorUid } = await assertSupervisorAssignment(
      supervisorUid,
      supervisorProfile,
      studentUid,
      studentProfile,
    );

    const studentId = getStudentNumber(studentProfile, studentUid);
    const studentName = getStudentName(studentProfile);
    const date = getLocalDate(new Date(now));
    const scanRef = db.collection("attendanceQrScans").doc(payload.nonce);
    const attendanceQuery = db.collection("attendance").where("studentUid", "==", studentUid);
    const fallbackAttendanceRef = db.collection("attendance").doc(`${studentUid}_${date}`);
    const time = getLocalTime(new Date(now));

    return db.runTransaction(async (transaction) => {
      const previousScan = await transaction.get(scanRef);
      if (previousScan.exists) {
        const previous = previousScan.data();
        return {
          alreadyRecorded: true,
          studentId,
          studentName,
          action: previous.action,
          time: previous.time,
          totalHours: previous.totalHours,
        };
      }

      const attendanceSnapshot = await transaction.get(attendanceQuery);
      const attendanceByNumber = await transaction.get(
        db.collection("attendance").where("studentId", "==", studentId),
      );
      const existingRecord = findAttendanceRecord([attendanceSnapshot, attendanceByNumber], date, studentUid);
      const attendanceRef = existingRecord?.ref || fallbackAttendanceRef;
      const attendanceDocument = existingRecord
        ? null
        : await transaction.get(attendanceRef);
      const previousAttendance = existingRecord
        ? existingRecord.data()
        : attendanceDocument.exists
          ? attendanceDocument.data()
          : {};
      if (attendanceDocument?.exists &&
          (previousAttendance.date !== date ||
           (previousAttendance.studentUid && previousAttendance.studentUid !== studentUid))) {
        throw new HttpsError("failed-precondition", "The attendance document does not match this student and date. Contact an administrator.");
      }
      let action;
      let totalHours;
      let attendance;
      if (requestedPeriod) {
        const result = updateAttendancePeriods(previousAttendance, requestedPeriod, time, studentName, date);
        const { periods } = result;
        totalHours = result.totalHours;
        action = attendancePeriods[requestedPeriod];
        attendance = {
          ...previousAttendance,
          studentUid,
          studentId,
          studentName,
          coordinatorUid: coordinatorUid || null,
          date,
          ...periods,
          timeIn: periods.amIn || periods.pmIn || periods.otIn || "",
          timeOut: periods.otOut || periods.pmOut || periods.amOut || "",
          totalHours,
          hours: totalHours,
          status: "Present",
          lastAttendanceAction: action,
          supervisorId: supervisorUid,
          updatedAt: FieldValue.serverTimestamp(),
          ...(!existingRecord && !attendanceDocument.exists
            ? { createdAt: FieldValue.serverTimestamp() }
            : {}),
        };
      } else {
        if (Object.values(periodFields).some((fields) => fields.some((field) => previousAttendance[field]))) {
          throw new HttpsError("failed-precondition", "Select an attendance period for this record.");
        }
        const currentTimeIn =
          previousAttendance.timeIn ||
          previousAttendance.morningTimeIn ||
          previousAttendance.afternoonTimeIn ||
          "";
        const currentTimeOut =
          previousAttendance.timeOut ||
          previousAttendance.morningTimeOut ||
          previousAttendance.afternoonTimeOut ||
          "";

        if (currentTimeIn && currentTimeOut) {
          throw new HttpsError("failed-precondition", `${studentName} already has both Time-In and Time-Out recorded today.`);
        }
        if (!currentTimeIn && currentTimeOut) {
          throw new HttpsError("failed-precondition", "A time-out exists without a valid time-in. Contact an administrator.");
        }

        action = currentTimeIn ? "Time-Out" : "Time-In";
        const nextTimeIn = currentTimeIn || (action === "Time-In" ? time : "");
        const nextTimeOut = currentTimeOut || (action === "Time-Out" ? time : "");
        if (nextTimeIn && parseAttendanceTime(nextTimeIn) === null) {
          throw new HttpsError("failed-precondition", "An existing attendance time is invalid. Contact an administrator.");
        }
        if (nextTimeOut && calculateHours(nextTimeIn, nextTimeOut) <= 0) {
          throw new HttpsError("failed-precondition", "Time-out must be later than its matching time-in.");
        }
        totalHours = calculateHours(nextTimeIn, nextTimeOut);
        attendance = {
          ...previousAttendance,
          studentUid,
          studentId,
          studentName,
          coordinatorUid: coordinatorUid || null,
          date,
          timeIn: nextTimeIn,
          timeOut: nextTimeOut,
          totalHours,
          hours: totalHours,
          status: "Present",
          lastAttendanceAction: action,
          supervisorId: supervisorUid,
          updatedAt: FieldValue.serverTimestamp(),
          ...(!existingRecord && !attendanceDocument.exists
            ? { createdAt: FieldValue.serverTimestamp() }
            : {}),
        };
      }

      transaction.create(scanRef, {
        studentUid,
        studentId,
        studentName,
        supervisorId: supervisorUid,
        action,
        time,
        totalHours,
        scannedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(attendanceRef, attendance);

      return { alreadyRecorded: false, studentId, studentName, action, time, totalHours };
    });
  },
);

exports.recordManualStudentAttendance = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in as a supervisor to record attendance.");
  }

  const supervisorUid = request.auth.uid;
  const supervisorProfile = await getUserProfile(supervisorUid);

  if (supervisorProfile?.role !== "supervisor") {
    throw new HttpsError("permission-denied", "Only supervisors can manually record attendance.");
  }

  const studentId = typeof request.data?.studentId === "string"
    ? request.data.studentId.trim()
    : "";

  const requestedDate = request.data?.date;
  let period = request.data?.period;
  const requestedTime = request.data?.time;

  // Accept the existing frontend overtime field names.
  if (period === "overtimeIn") period = "otIn";
  if (period === "overtimeOut") period = "otOut";

  if (!studentId || studentId.length > 128) {
    throw new HttpsError("invalid-argument", "Enter a valid student ID number.");
  }

  // Validate date format and prevent future attendance entries.
  if (
    typeof requestedDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
  ) {
    throw new HttpsError("invalid-argument", "Enter a valid attendance date.");
  }

  const [year, month, day] = requestedDate.split("-").map(Number);
  const dateCheck = new Date(Date.UTC(year, month - 1, day));

  if (
    dateCheck.getUTCFullYear() !== year ||
    dateCheck.getUTCMonth() !== month - 1 ||
    dateCheck.getUTCDate() !== day
  ) {
    throw new HttpsError("invalid-argument", "The attendance date is invalid.");
  }

  if (requestedDate > getLocalDate(new Date())) {
    throw new HttpsError("failed-precondition", "Attendance cannot be recorded for a future date.");
  }

  if (typeof period !== "string" || !Object.hasOwn(attendancePeriods, period)) {
    throw new HttpsError("invalid-argument", "Select a valid attendance period.");
  }

  // Accept the HTML time input format: HH:mm.
  if (
    typeof requestedTime !== "string" ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(requestedTime)
  ) {
    throw new HttpsError("invalid-argument", "Enter a valid attendance time.");
  }

  const [hour, minute] = requestedTime.split(":").map(Number);
  const time = `${String(hour % 12 || 12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;

  const userCollection = db.collection("users");

  const matchingProfiles = await Promise.all(
    ["studentId", "studentID", "idNumber"].map((field) =>
      userCollection.where(field, "==", studentId).limit(2).get()
    )
  );

  const matchesByUid = new Map();

  matchingProfiles.forEach((snapshot) => {
    snapshot.docs.forEach((document) => {
      if (document.data().role === "student") {
        matchesByUid.set(document.id, document);
      }
    });
  });

  const studentSnapshot = studentId.includes("/")
    ? null
    : await userCollection.doc(studentId).get();

  if (studentSnapshot?.exists && studentSnapshot.data().role === "student") {
    matchesByUid.set(studentSnapshot.id, studentSnapshot);
  }

  if (matchesByUid.size === 0) {
    throw new HttpsError("not-found", "No student account matches that ID number.");
  }

  if (matchesByUid.size > 1) {
    throw new HttpsError("failed-precondition", "More than one student account matches that ID. Contact an administrator.");
  }

  const studentDocument = [...matchesByUid.values()][0];
  const studentUid = studentDocument.id;
  const studentProfile = studentDocument.data();
  const canonicalStudentId = getStudentNumber(studentProfile, studentUid);

  const { coordinatorUid } = await assertSupervisorAssignment(
    supervisorUid,
    supervisorProfile,
    studentUid,
    studentProfile
  );

  const studentName = getStudentName(studentProfile);
  const attendanceCollection = db.collection("attendance");

  const attendanceByUid = attendanceCollection.where("studentUid", "==", studentUid);
  const attendanceByNumber = attendanceCollection.where("studentId", "==", studentId);
  const attendanceQueries = [attendanceByUid, attendanceByNumber];
  if (canonicalStudentId !== studentId) {
    attendanceQueries.push(attendanceCollection.where("studentId", "==", canonicalStudentId));
  }

  return db.runTransaction(async (transaction) => {
    const records = await Promise.all(attendanceQueries.map((query) => transaction.get(query)));

    const currentRecord = findAttendanceRecord(
      records,
      requestedDate,
      studentUid
    );

    const attendanceRef =
      currentRecord?.ref ||
      attendanceCollection.doc(`${studentUid}_${requestedDate}`);

    const fallbackDocument = currentRecord
      ? null
      : await transaction.get(attendanceRef);

    const previous = currentRecord
      ? currentRecord.data()
      : fallbackDocument.exists
        ? fallbackDocument.data()
        : {};

    if (
      fallbackDocument?.exists &&
      (
        previous.date !== requestedDate ||
        (previous.studentUid && previous.studentUid !== studentUid)
      )
    ) {
      throw new HttpsError("failed-precondition", "The attendance document does not match this student and date. Contact an administrator.");
    }

    const { periods, totalHours } = updateAttendancePeriods(
      previous,
      period,
      time,
      studentName,
      requestedDate
    );

    const attendance = {
      ...previous,
      studentUid,
      studentId: canonicalStudentId,
      studentName,
      coordinatorUid: coordinatorUid || null,
      date: requestedDate,
      ...periods,
      timeIn: periods.amIn || periods.pmIn || periods.otIn || "",
      timeOut: periods.otOut || periods.pmOut || periods.amOut || "",
      totalHours,
      hours: totalHours,
      status: "Present",
      lastAttendanceAction: attendancePeriods[period],
      manualEntry: true,
      supervisorId: supervisorUid,
      manualEntryBy: supervisorUid,
      manualEntryAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      ...(!currentRecord && !fallbackDocument.exists
        ? { createdAt: FieldValue.serverTimestamp() }
        : {})
    };

    transaction.set(attendanceRef, attendance);

    return {
      studentId: canonicalStudentId,
      studentName,
      date: requestedDate,
      period: attendancePeriods[period],
      time,
      totalHours
    };
  });
});