const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const documents = new Map();
const secret = "test-secret";
const timestamp = Symbol("server timestamp");
const db = {
  collection(name) {
    return {
      doc(id) {
        return { path: `${name}/${id}`, id, get: async function () { return snapshot(this.path); } };
      },
      where(field, operator, value) {
        assert.equal(operator, "==");
        return {
          name, field, value,
          limit() { return this; },
          async get() { return querySnapshot(this); },
        };
      },
    };
  },
  async runTransaction(callback) {
    return callback({
      async get(target) {
        return target.path ? snapshot(target.path) : querySnapshot(target);
      },
      create(ref, data) {
        assert.equal(documents.has(ref.path), false);
        documents.set(ref.path, data);
      },
      set(ref, data) { documents.set(ref.path, data); },
    });
  },
};

function snapshot(path) {
  const data = documents.get(path);
  return {
    id: path.split("/").pop(),
    ref: { path },
    exists: data !== undefined,
    data: () => data,
  };
}

function querySnapshot(query) {
  const docs = [...documents.keys()]
    .filter((path) => path.startsWith(`${query.name}/`) && documents.get(path)[query.field] === query.value)
    .map(snapshot);
  return { docs, size: docs.length };
}

class HttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const mocks = {
  "firebase-admin/app": { initializeApp() {} },
  "firebase-admin/auth": { getAuth() {} },
  "firebase-admin/firestore": { getFirestore: () => db, FieldValue: { serverTimestamp: () => timestamp } },
  "firebase-functions/params": { defineSecret: () => ({ value: () => secret }) },
  "firebase-functions/v2/https": {
    HttpsError,
    onCall: (options, handler) => handler || options,
    onRequest: (options, handler) => handler,
  },
  "./accountState": { isAccountLive: () => true, isRecordArchived: () => false },
  "./departments": { recordDepartmentId: () => "dept", sameDepartment: () => true },
  "./accountManagement": { manageAccount() {}, handleManageAccount() {} },
  "./studentRegistration": { createStudentAccount() {}, resendStudentAccountNotification() {} },
  "./roleAccountMirror": { mirrorRoleAccount() {} },
};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (Object.hasOwn(mocks, request)) return mocks[request];
  return originalLoad.call(this, request, parent, isMain);
};
let functions;
try {
  functions = require("./index");
} finally {
  Module._load = originalLoad;
}

const RealDate = Date;
let now;
class FixedDate extends RealDate {
  constructor(...args) {
    super(...(args.length ? args : [now]));
  }
  static now() { return now; }
}

function setManilaTime(hour, minute = 0) {
  now = RealDate.parse(`2026-11-14T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+08:00`);
}

function setup() {
  documents.clear();
  documents.set("users/supervisor", { role: "supervisor" });
  documents.set("users/coordinator", { role: "coordinator" });
  documents.set("users/student", {
    role: "student", studentId: "S-1", name: "Student", supervisorUid: "supervisor", coordinatorUid: "coordinator",
  });
  setManilaTime(8);
}

async function record(method, period) {
  const auth = { uid: "supervisor" };
  if (method === "manual") {
    const time = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).format(new Date(now));
    return functions.recordManualStudentAttendance({ auth, data: { studentId: "S-1", date: "2026-11-14", time, period } });
  }
  const { token } = await functions.issueStudentAttendanceQrToken({ auth: { uid: "student" } });
  return functions.scanStudentAttendanceQr({ auth, data: { token, period } });
}

test("manual and QR attendance enforce six periods and sum all three sessions", async () => {
  global.Date = FixedDate;
  try {
    for (const method of ["manual", "qr"]) {
      setup();
      await assert.rejects(record(method, "otIn"), /requires PM \/ OUT first/);
      await assert.rejects(record(method, "otOut"), /requires a matching time-in/);
      const entries = [
        ["amIn", 8, 0], ["amOut", 12, 0], ["pmIn", 13, 0],
        ["pmOut", 17, 0], ["otIn", 17, 30], ["otOut", 19, 0],
      ];
      for (const [period, hour, minute] of entries) {
        setManilaTime(hour, minute);
        const result = await record(method, period);
        assert.match(result.time, /(?:AM|PM)$/);
        await assert.rejects(record(method, period), /already has/);
      }
      const saved = documents.get("attendance/student_2026-11-14");
      assert.deepEqual(
        entries.map(([period]) => saved[period]),
        ["08:00 AM", "12:00 PM", "01:00 PM", "05:00 PM", "05:30 PM", "07:00 PM"],
      );
      assert.equal(saved.totalHours, 9.5);
      assert.equal(saved.hours, 9.5);
      assert.equal(saved.timeIn, "08:00 AM");
      assert.equal(saved.timeOut, "07:00 PM");
      assert.equal(saved.updatedAt, timestamp);
      assert.equal(saved.createdAt, timestamp);
    }
  } finally {
    global.Date = RealDate;
  }
});

test("both paths reject invalid and duplicate legacy periods without treating aggregate timeOut as PM Out", async () => {
  global.Date = FixedDate;
  try {
    for (const method of ["manual", "qr"]) {
      setup();
      const path = "attendance/student_2026-11-14";
      documents.set(path, {
        studentUid: "student", studentId: "S-1", date: "2026-11-14",
        morningTimeIn: "08:00 AM", morningTimeOut: "12:00 PM",
        timeIn: "08:00 AM", timeOut: "12:00 PM", note: "preserved",
      });
      setManilaTime(13);
      await assert.rejects(record(method, "amOut"), /already has/);
      await assert.rejects(record(method, "pmOut"), /requires a matching time-in/);
      await record(method, "pmIn");
      setManilaTime(17);
      await record(method, "pmOut");
      assert.equal(documents.get(path).totalHours, 8);
      assert.equal(documents.get(path).note, "preserved");
      documents.get(path).overtimeIn = "05:30 PM";
      setManilaTime(18);
      await assert.rejects(record(method, "otIn"), /already has/);
      await record(method, "otOut");
      assert.equal(documents.get(path).totalHours, 8.5);
    }
  } finally {
    global.Date = RealDate;
  }
});

test("both paths reject same-minute time-outs and duplicate daily documents", async () => {
  global.Date = FixedDate;
  try {
    for (const method of ["manual", "qr"]) {
      setup();
      await record(method, "amIn");
      await assert.rejects(record(method, "amOut"), /later than its matching time-in/);
      documents.set("attendance/duplicate", {
        studentUid: "student", studentId: "S-1", date: "2026-11-14",
      });
      setManilaTime(9);
      await assert.rejects(record(method, "amOut"), /Multiple attendance records/);
    }
  } finally {
    global.Date = RealDate;
  }
});

test("QR replay remains idempotent and legacy scans retain their two-action behavior", async () => {
  global.Date = FixedDate;
  try {
    setup();
    const auth = { uid: "supervisor" };
    const first = await functions.issueStudentAttendanceQrToken({ auth: { uid: "student" } });
    const request = { auth, data: { token: first.token } };
    assert.equal((await functions.scanStudentAttendanceQr(request)).action, "Time-In");
    assert.equal((await functions.scanStudentAttendanceQr(request)).alreadyRecorded, true);
    setManilaTime(12);
    const second = await functions.issueStudentAttendanceQrToken({ auth: { uid: "student" } });
    const result = await functions.scanStudentAttendanceQr({ auth, data: { token: second.token } });
    assert.equal(result.action, "Time-Out");
    assert.equal(result.totalHours, 4);
    setManilaTime(13);
    await record("manual", "pmIn");
    const saved = documents.get("attendance/student_2026-11-14");
    assert.equal(saved.amIn, "08:00 AM");
    assert.equal(saved.amOut, "12:00 PM");
    assert.equal(saved.totalHours, 4);
  } finally {
    global.Date = RealDate;
  }
});

test("both paths reject invalid stored session times and time order", async () => {
  global.Date = FixedDate;
  try {
    for (const method of ["manual", "qr"]) {
      setup();
      const path = "attendance/student_2026-11-14";
      const previous = {
        studentUid: "student", studentId: "S-1", date: "2026-11-14",
        amIn: "08:00 AM", amOut: "25:00 PM",
      };
      documents.set(path, previous);
      setManilaTime(13);
      await assert.rejects(record(method, "pmIn"), /existing attendance time is invalid/);
      previous.amOut = "12:00 PM";
      setManilaTime(11);
      await assert.rejects(record(method, "pmIn"), /order of existing attendance times/);
      previous.amOut = "07:00 AM";
      await assert.rejects(record(method, "pmIn"), /existing attendance session is invalid/);
    }
  } finally {
    global.Date = RealDate;
  }
});

test("manual attendance saves selected past date and time, overtime aliases, and audit fields", async () => {
  global.Date = FixedDate;
  try {
    setup();
    const path = "attendance/student_2026-11-13";
    documents.set(path, {
      studentUid: "student", studentId: "S-1", date: "2026-11-13",
      amIn: "08:00 AM", amOut: "12:00 PM", pmIn: "01:00 PM", pmOut: "05:00 PM",
      note: "preserved",
    });
    const request = (period, time) => ({
      auth: { uid: "supervisor" },
      data: { studentId: "S-1", date: "2026-11-13", period, time },
    });
    const result = await functions.recordManualStudentAttendance(request("overtimeIn", "17:30"));
    assert.equal(result.date, "2026-11-13");
    assert.equal(result.time, "05:30 PM");
    await assert.rejects(functions.recordManualStudentAttendance(request("otIn", "17:45")), /already has/);
    await functions.recordManualStudentAttendance(request("overtimeOut", "19:00"));
    const saved = documents.get(path);
    assert.equal(saved.otIn, "05:30 PM");
    assert.equal(saved.otOut, "07:00 PM");
    assert.equal(saved.totalHours, 9.5);
    assert.equal(saved.note, "preserved");
    assert.equal(saved.manualEntry, true);
    assert.equal(saved.manualEntryBy, "supervisor");
    assert.equal(saved.manualEntryAt, timestamp);
  } finally {
    global.Date = RealDate;
  }
});

test("manual attendance rejects invalid input, future dates, and unauthorized callers", async () => {
  global.Date = FixedDate;
  try {
    setup();
    const data = { studentId: "S-1", date: "2026-11-14", time: "08:00", period: "amIn" };
    const call = (overrides = {}, auth = { uid: "supervisor" }) =>
      functions.recordManualStudentAttendance({ auth, data: { ...data, ...overrides } });
    await assert.rejects(call({}, null), /Sign in as a supervisor/);
    await assert.rejects(call({}, { uid: "student" }), /Only supervisors/);
    await assert.rejects(call({ date: "2026-11-15" }), /future date/);
    await assert.rejects(call({ date: "2026-02-30" }), /date is invalid/);
    await assert.rejects(call({ time: "24:00" }), /valid attendance time/);
    await assert.rejects(call({ time: undefined }), /valid attendance time/);
    await assert.rejects(call({ period: "other" }), /valid attendance period/);
    documents.get("users/student").supervisorUid = "someone-else";
    await assert.rejects(call(), /not assigned/);
  } finally {
    global.Date = RealDate;
  }
});

test("manual attendance finds legacy records when a student UID is selected", async () => {
  global.Date = FixedDate;
  try {
    setup();
    documents.set("attendance/legacy", {
      studentId: "S-1", date: "2026-11-13", amIn: "08:00 AM", note: "preserved",
    });
    const result = await functions.recordManualStudentAttendance({
      auth: { uid: "supervisor" },
      data: { studentId: "student", date: "2026-11-13", time: "12:00", period: "amOut" },
    });
    assert.equal(result.studentId, "S-1");
    assert.equal(documents.get("attendance/legacy").note, "preserved");
    assert.equal(documents.get("attendance/legacy").totalHours, 4);
    assert.equal(documents.has("attendance/student_2026-11-13"), false);
  } finally {
    global.Date = RealDate;
  }
});
