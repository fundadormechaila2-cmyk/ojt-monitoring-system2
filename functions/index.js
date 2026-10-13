const { createHmac, randomBytes, timingSafeEqual } = require("node:crypto");
const { initializeApp } = require("firebase-admin/app");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const { defineSecret } = require("firebase-functions/params");
const { HttpsError, onCall } = require("firebase-functions/v2/https");

initializeApp();

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
  if (supervisorProfile.status && supervisorProfile.status !== "ACTIVE") {
    throw new HttpsError("permission-denied", "This supervisor account is inactive.");
  }

  const studentRecord = await getStudentRecord(studentUid, studentProfile);
  const assignedSupervisorUid = studentProfile.supervisorUid || studentRecord?.supervisorUid;
  if (assignedSupervisorUid !== supervisorUid) {
    throw new HttpsError("permission-denied", "This student is not assigned to your supervisor account.");
  }

  const coordinatorUid = studentProfile.coordinatorUid || studentRecord?.coordinatorUid;
  const coordinatorProfile = coordinatorUid ? await getUserProfile(coordinatorUid) : null;
  if (
    coordinatorProfile?.role !== "coordinator" ||
    !coordinatorProfile.department ||
    supervisorProfile.department !== coordinatorProfile.department
  ) {
    throw new HttpsError("permission-denied", "The student and supervisor do not share a valid department assignment.");
  }

  return { studentRecord, coordinatorUid };
}

function calculateHours(timeIn, timeOut) {
  const parseTime = (value) => {
    const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(value || "");
    if (!match) return null;
    let hour = Number(match[1]) % 12;
    if (match[3].toUpperCase() === "PM") hour += 12;
    return hour * 60 + Number(match[2]);
  };

  const start = parseTime(timeIn);
  const end = parseTime(timeOut);
  return start === null || end === null
    ? 0
    : Number((Math.max(0, end - start) / 60).toFixed(2));
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
    const attendancePeriods = {
      amIn: "AM / IN",
      amOut: "AM / OUT",
      pmIn: "PM / IN",
      pmOut: "PM / OUT",
    };
    if (requestedPeriod !== undefined && !Object.hasOwn(attendancePeriods, requestedPeriod)) {
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
      const existingRecord =
        attendanceSnapshot.docs.find((document) => document.data().date === date) ||
        attendanceByNumber.docs.find((document) => document.data().date === date);
      const attendanceRef = existingRecord?.ref || fallbackAttendanceRef;
      const attendanceDocument = existingRecord
        ? null
        : await transaction.get(attendanceRef);
      const previousAttendance = existingRecord
        ? existingRecord.data()
        : attendanceDocument.exists
          ? attendanceDocument.data()
          : {};
      let action;
      let totalHours;
      let attendance;
      if (requestedPeriod) {
        if (previousAttendance[requestedPeriod]) {
          throw new HttpsError(
            "failed-precondition",
            `${studentName} already has ${attendancePeriods[requestedPeriod]} recorded today.`,
          );
        }

        const matchingTimeIn = requestedPeriod === "amOut"
          ? previousAttendance.amIn || previousAttendance.morningTimeIn || previousAttendance.timeIn
          : requestedPeriod === "pmOut"
            ? previousAttendance.pmIn || previousAttendance.afternoonTimeIn
            : null;
        const matchingTimeOut = requestedPeriod === "amIn"
          ? previousAttendance.amOut || previousAttendance.morningTimeOut
          : requestedPeriod === "pmIn"
            ? previousAttendance.pmOut || previousAttendance.afternoonTimeOut
            : null;
        if (requestedPeriod.endsWith("In") && matchingTimeOut) {
          throw new HttpsError("failed-precondition", `${attendancePeriods[requestedPeriod]} cannot be recorded after its matching time-out.`);
        }
        if (requestedPeriod.endsWith("Out") && !matchingTimeIn) {
          throw new HttpsError("failed-precondition", `${attendancePeriods[requestedPeriod]} requires a matching time-in first.`);
        }
        if (requestedPeriod.endsWith("Out") && calculateHours(matchingTimeIn, time) <= 0) {
          throw new HttpsError("failed-precondition", "Time-out must be later than its matching time-in.");
        }

        const periods = {
          ...previousAttendance,
          [requestedPeriod]: time,
        };
        const amIn =
          periods.amIn || periods.morningTimeIn || periods.timeIn || "";
        const amOut = periods.amOut || periods.morningTimeOut || "";
        const pmIn = periods.pmIn || periods.afternoonTimeIn || "";
        const pmOut =
          periods.pmOut || periods.afternoonTimeOut || periods.timeOut || "";
        totalHours =
          calculateHours(amIn, amOut) + calculateHours(pmIn, pmOut);
        action = attendancePeriods[requestedPeriod];
        attendance = {
          ...previousAttendance,
          studentUid,
          studentId,
          studentName,
          coordinatorUid: coordinatorUid || null,
          date,
          [requestedPeriod]: time,
          timeIn: amIn || pmIn || previousAttendance.timeIn || "",
          timeOut: pmOut || amOut || previousAttendance.timeOut || "",
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
  const period = request.data?.period;
  const serverNow = new Date();
  const date = getLocalDate(serverNow);
  const time = getLocalTime(serverNow);
  const periodLabels = {
    amIn: "AM / IN",
    amOut: "AM / OUT",
    pmIn: "PM / IN",
    pmOut: "PM / OUT",
  };
  if (!studentId || studentId.length > 128) {
    throw new HttpsError("invalid-argument", "Enter a valid student ID number.");
  }
  if (requestedDate !== date) {
    throw new HttpsError("failed-precondition", "Manual attendance can only be recorded for today using the server time.");
  }
  if (!Object.hasOwn(periodLabels, period)) {
    throw new HttpsError("invalid-argument", "Select a valid attendance period.");
  }
  const userCollection = db.collection("users");
  const matchingProfiles = await Promise.all(
    ["studentId", "studentID", "idNumber"].map((field) =>
      userCollection.where(field, "==", studentId).limit(2).get(),
    ),
  );
  const matchesByUid = new Map();
  matchingProfiles.forEach((snapshot) => {
    snapshot.docs.forEach((document) => {
      if (document.data().role === "student") {
        matchesByUid.set(document.id, document);
      }
    });
  });

  const studentSnapshot = await userCollection.doc(studentId).get();
  if (studentSnapshot.exists && studentSnapshot.data().role === "student") {
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
  const { coordinatorUid } = await assertSupervisorAssignment(
    supervisorUid,
    supervisorProfile,
    studentUid,
    studentProfile,
  );
  const studentName = getStudentName(studentProfile);
  const timeParts = time.split(":").map(Number);
  const hour = timeParts[0] % 12 || 12;
  const formattedTime = `${hour}:${String(timeParts[1]).padStart(2, "0")} ${timeParts[0] >= 12 ? "PM" : "AM"}`;
  const attendanceCollection = db.collection("attendance");
  const attendanceByUid = attendanceCollection
    .where("studentUid", "==", studentUid)
    .limit(10);
  const attendanceByNumber = attendanceCollection
    .where("studentId", "==", studentId)
    .limit(10);

  return db.runTransaction(async (transaction) => {
    const [uidRecords, idRecords] = await Promise.all([
      transaction.get(attendanceByUid),
      transaction.get(attendanceByNumber),
    ]);
    const currentRecord =
      uidRecords.docs.find((document) => document.data().date === date) ||
      idRecords.docs.find((document) => document.data().date === date);
    const attendanceRef =
      currentRecord?.ref ||
      attendanceCollection.doc(`${studentUid}_${date}`);
    const fallbackDocument = currentRecord
      ? null
      : await transaction.get(attendanceRef);
    const previous = currentRecord
      ? currentRecord.data()
      : fallbackDocument.exists
        ? fallbackDocument.data()
        : {};

    const existingPeriods = {
      amIn: previous.amIn || previous.morningTimeIn || previous.timeIn || "",
      amOut: previous.amOut || previous.morningTimeOut || "",
      pmIn: previous.pmIn || previous.afternoonTimeIn || "",
      pmOut: previous.pmOut || previous.afternoonTimeOut || previous.timeOut || "",
    };
    if (existingPeriods[period]) {
      throw new HttpsError(
        "failed-precondition",
        `${studentName} already has ${periodLabels[period]} recorded for ${date}.`,
      );
    }

    const matchingTimeIn = period === "amOut"
      ? existingPeriods.amIn
      : period === "pmOut"
        ? existingPeriods.pmIn
        : null;
    const matchingTimeOut = period === "amIn"
      ? existingPeriods.amOut
      : period === "pmIn"
        ? existingPeriods.pmOut
        : null;
    if (period.endsWith("In") && matchingTimeOut) {
      throw new HttpsError("failed-precondition", `${periodLabels[period]} cannot be recorded after its matching time-out.`);
    }
    if (period.endsWith("Out") && !matchingTimeIn) {
      throw new HttpsError("failed-precondition", `${periodLabels[period]} requires a matching time-in first.`);
    }
    if (period.endsWith("Out") && calculateHours(matchingTimeIn, formattedTime) <= 0) {
      throw new HttpsError("failed-precondition", "Time-out must be later than its matching time-in.");
    }

    const periods = { ...existingPeriods, [period]: formattedTime };
    const totalHours =
      calculateHours(periods.amIn, periods.amOut) +
      calculateHours(periods.pmIn, periods.pmOut);
    const attendance = {
      ...previous,
      studentUid,
      studentId,
      studentName,
      coordinatorUid: coordinatorUid || null,
      date,
      ...periods,
      timeIn: periods.amIn || periods.pmIn,
      timeOut: periods.pmOut || periods.amOut,
      totalHours,
      hours: totalHours,
      status: "Present",
      lastAttendanceAction: periodLabels[period],
      manualEntry: true,
      supervisorId: supervisorUid,
      updatedAt: FieldValue.serverTimestamp(),
      ...(!currentRecord && !fallbackDocument.exists
        ? { createdAt: FieldValue.serverTimestamp() }
        : {}),
    };

    transaction.set(attendanceRef, attendance);
    return {
      studentId,
      studentName,
      date,
      period: periodLabels[period],
      time: formattedTime,
      totalHours,
    };
  });
});
