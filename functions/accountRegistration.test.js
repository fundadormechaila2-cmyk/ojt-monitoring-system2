const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const docs = new Map();
const accounts = new Map();
const messages = [];
let failAuth = false;
let failWrites = false;
let failEmail = false;
let verifiedUid = "student-uid";
const timestamp = Symbol("timestamp");

function snapshot(path) {
  const data = docs.get(path);
  return { id: path.split("/").pop(), exists: data !== undefined, data: () => data };
}
function reference(collection, id) {
  const path = `${collection}/${id}`;
  return { path, get: async () => snapshot(path) };
}
function writer() {
  const operations = [];
  return {
    async get(ref) { return snapshot(ref.path); },
    create(ref, data) { operations.push([ref.path, data, false]); },
    set(ref, data, options) { operations.push([ref.path, data, !!options?.merge]); },
    update(ref, data) { operations.push([ref.path, data, true]); },
    async commit() {
      if (failWrites) throw new Error("write failed");
      for (const [path, data, merge] of operations) {
        docs.set(path, merge ? { ...docs.get(path), ...data } : data);
      }
    },
  };
}
const db = {
  collection(name) {
    return {
      doc(id) { return reference(name, id); },
      where(field, op, value) {
        assert.equal(op, "==");
        return {
          limit() { return this; },
          async get() {
            const found = [...docs.entries()].filter(([path, data]) =>
              path.startsWith(`${name}/`) && data[field] === value);
            return { empty: found.length === 0 };
          },
        };
      },
    };
  },
  batch: writer,
  async runTransaction(callback) {
    const transaction = writer();
    const result = await callback(transaction);
    await transaction.commit();
    return result;
  },
};
const auth = {
  async createUser(data) {
    if (failAuth || [...accounts.values()].some((user) => user.email === data.email)) {
      throw Object.assign(new Error("duplicate"), { code: "auth/email-already-exists" });
    }
    const uid = data.email.startsWith("student") ? "student-uid" :
      data.email.startsWith("supervisor") ? "supervisor-uid" : "coordinator-uid";
    accounts.set(uid, { ...data, uid });
    return { uid };
  },
  async deleteUser(uid) { accounts.delete(uid); },
  async updateUser(uid, data) { accounts.set(uid, { ...accounts.get(uid), ...data }); },
  async revokeRefreshTokens() {},
  async verifyIdToken() { return { uid: verifiedUid }; },
};
class HttpsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const mocks = {
  "firebase-admin/auth": { getAuth: () => auth },
  "firebase-admin/firestore": { getFirestore: () => db, FieldValue: { serverTimestamp: () => timestamp } },
  "firebase-functions/params": { defineSecret: (name) => ({ value: () => name === "SMTP_PORT" ? "587" : "test" }) },
  "firebase-functions/v2/https": { HttpsError, onCall: (options, handler) => handler || options },
  "firebase-functions/logger": { error() {} },
  nodemailer: { createTransport: () => ({ async sendMail(message) {
    if (failEmail) throw new Error("SMTP failed");
    messages.push(message);
  } }) },
};
const originalLoad = Module._load;
Module._load = function (name, parent, isMain) {
  return Object.hasOwn(mocks, name) ? mocks[name] : originalLoad.call(this, name, parent, isMain);
};
let student, coordinator, supervisor, passwordChange;
try {
  student = require("./studentRegistration");
  coordinator = require("./coordinatorRegistration");
  supervisor = require("./supervisorRegistration");
  passwordChange = require("./passwordChange");
} finally {
  Module._load = originalLoad;
}

function setup() {
  docs.clear();
  accounts.clear();
  messages.length = 0;
  failAuth = false;
  failWrites = false;
  failEmail = false;
  verifiedUid = "student-uid";
  docs.set("users/admin", { role: "admin", status: "ACTIVE" });
  docs.set("students/roster", { course: "BSIT", studentId: "123" });
}
const studentRequest = {
  auth: { uid: "admin" },
  data: { studentRecordId: "roster", firstName: "Ada", lastName: "Student", email: "student@example.test" },
};
const coordinatorRequest = {
  auth: { uid: "admin" },
  data: { fullName: "Alex Coordinator", email: "coordinator@example.test", department: "BSIT" },
};

test("admin creates isolated student and coordinator accounts and emails their credentials", async () => {
  setup();
  const createdStudent = await student.createStudentAccountHandler(studentRequest);
  const createdCoordinator = await coordinator.createCoordinatorAccountHandler(coordinatorRequest);
  assert.equal(createdStudent.emailStatus, "Sent");
  assert.equal(createdCoordinator.emailStatus, "Sent");
  assert.equal(docs.get("students/roster").studentUid, "student-uid");
  assert.equal(docs.get("studentsAccount/student-uid").mustChangePassword, true);
  assert.equal(docs.get("coordinatorsAccount/coordinator-uid").role, "coordinator");
  assert.equal(docs.has("studentsAccount/coordinator-uid"), false);
  assert.equal(docs.has("coordinatorsAccount/student-uid"), false);
  assert.equal(docs.has("supervisorsAccount/coordinator-uid"), false);
  for (const message of messages) {
    const account = [...accounts.values()].find((item) => item.email === message.to);
    assert.ok(message.text.includes(account.password));
    assert.ok(message.text.includes("La Consolacion College Isabela"));
    assert.ok(message.text.includes(account.uid === "student-uid" ? "Student" : "Coordinator"));
    for (const profile of docs.values()) assert.equal(JSON.stringify(profile).includes(account.password), false);
  }
});

test("unauthorized callers, duplicate emails, and failed writes do not create profiles", async () => {
  setup();
  await assert.rejects(student.createStudentAccountHandler({ ...studentRequest, auth: { uid: "student" } }), { code: "permission-denied" });
  await assert.rejects(coordinator.createCoordinatorAccountHandler({ ...coordinatorRequest, auth: null }), { code: "unauthenticated" });
  failAuth = true;
  await assert.rejects(student.createStudentAccountHandler(studentRequest), { code: "already-exists" });
  assert.equal(docs.has("studentsAccount/student-uid"), false);
  failAuth = false;
  failWrites = true;
  await assert.rejects(coordinator.createCoordinatorAccountHandler(coordinatorRequest), { code: "internal" });
  assert.equal(accounts.size, 0);
  assert.equal(docs.has("coordinatorsAccount/coordinator-uid"), false);
});

test("email failure leaves an identifiable account with failed delivery status", async () => {
  setup();
  failEmail = true;
  const result = await student.createStudentAccountHandler(studentRequest);
  assert.equal(result.emailStatus, "Failed");
  assert.equal(docs.get("users/student-uid").accountNotificationStatus, "Failed");
  assert.equal(docs.get("users/student-uid").mustChangePassword, true);
  await assert.rejects(student.createStudentAccountHandler(studentRequest), { code: "already-exists" });
  const coordinatorResult = await coordinator.createCoordinatorAccountHandler(coordinatorRequest);
  assert.equal(coordinatorResult.emailStatus, "Failed");
  assert.equal(docs.get("coordinatorsAccount/coordinator-uid").accountNotificationStatus, "Failed");
});

test("resending issues a new password and restores the first-login gate", async () => {
  setup();
  await student.createStudentAccountHandler(studentRequest);
  await coordinator.createCoordinatorAccountHandler(coordinatorRequest);
  const oldStudentPassword = accounts.get("student-uid").password;
  const oldCoordinatorPassword = accounts.get("coordinator-uid").password;
  docs.get("users/student-uid").mustChangePassword = false;
  docs.get("users/coordinator-uid").mustChangePassword = false;
  const studentResult = await student.resendStudentAccountNotificationHandler({
    auth: { uid: "admin" }, data: { studentRecordId: "roster" },
  });
  const coordinatorResult = await coordinator.resendCoordinatorNotificationHandler({
    auth: { uid: "admin" }, data: { uid: "coordinator-uid" },
  });
  assert.equal(studentResult.emailStatus, "Sent");
  assert.equal(coordinatorResult.emailStatus, "Sent");
  assert.notEqual(accounts.get("student-uid").password, oldStudentPassword);
  assert.notEqual(accounts.get("coordinator-uid").password, oldCoordinatorPassword);
  assert.equal(docs.get("users/student-uid").mustChangePassword, true);
  assert.equal(docs.get("users/coordinator-uid").mustChangePassword, true);
});

test("password change verifies the current password and updates the authoritative role state", async () => {
  setup();
  await student.createStudentAccountHandler(studentRequest);
  const previousFetch = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ idToken: "verified-token" }) });
  const request = { auth: { uid: "student-uid" }, data: {
    currentPassword: accounts.get("student-uid").password, newPassword: "NewPassword1!", apiKey: "key",
  } };
  try {
    await assert.rejects(passwordChange.completePasswordChangeHandler({
      ...request, data: { ...request.data, newPassword: request.data.currentPassword },
    }), { code: "invalid-argument" });
    global.fetch = async () => ({ ok: false });
    await assert.rejects(passwordChange.completePasswordChangeHandler(request), { code: "permission-denied" });
    global.fetch = async () => ({ ok: true, json: async () => ({ idToken: "verified-token" }) });
    verifiedUid = "another-user";
    await assert.rejects(passwordChange.completePasswordChangeHandler(request), { code: "permission-denied" });
    assert.equal(docs.get("users/student-uid").mustChangePassword, true);
    verifiedUid = "student-uid";
    await passwordChange.completePasswordChangeHandler(request);
    assert.equal(accounts.get("student-uid").password, "NewPassword1!");
    assert.equal(docs.get("users/student-uid").mustChangePassword, false);
    assert.equal(docs.get("studentsAccount/student-uid").mustChangePassword, false);
    assert.equal(docs.get("students/roster").mustChangePassword, false);
  } finally {
    global.fetch = previousFetch;
  }
});

test("coordinator creates a supervisor with isolated profiles, assignments and emailed credentials", async () => {
  setup();
  docs.set("users/coord", { role: "coordinator", department: "BSIT" });
  docs.set("students/roster", { coordinatorUid: "coord", departmentId: "BSIT", schoolYear: "2025-2026", studentUid: "linked" });
  docs.set("users/linked", { role: "student", coordinatorUid: "coord", studentRecordId: "roster" });
  docs.set("studentsAccount/linked", { role: "student" });
  docs.set("partnerCompanies/company", { name: "Company" });
  const request = { auth: { uid: "coord" }, data: {
    firstName: "Ada", lastName: "Supervisor", email: "supervisor@gmail.com",
    company: "Company", partnerCompanyId: "company", schoolYear: "2025-2026",
    assignedStudentRecordIds: ["roster"],
  } };
  const result = await supervisor.createSupervisorAccountHandler(request);
  assert.equal(result.emailStatus, "Sent");
  for (const collection of ["users", "supervisorsAccount", "supervisors"]) {
    const profile = docs.get(`${collection}/supervisor-uid`);
    assert.equal(profile.role, "supervisor");
    assert.equal(profile.mustChangePassword, true);
    assert.equal(profile.coordinatorUid, "coord");
    assert.equal(profile.partnerCompanyId, "company");
    assert.equal(JSON.stringify(profile).includes(accounts.get("supervisor-uid").password), false);
  }
  assert.equal(docs.has("studentsAccount/supervisor-uid"), false);
  assert.equal(docs.has("coordinatorsAccount/supervisor-uid"), false);
  assert.equal(docs.get("students/roster").supervisorUid, "supervisor-uid");
  assert.equal(docs.get("users/linked").supervisorUid, "supervisor-uid");
  assert.equal(docs.get("studentsAccount/linked").supervisorUid, "supervisor-uid");
  assert.match(messages[0].text, /Supervisor/);
  assert.ok(messages[0].text.includes(accounts.get("supervisor-uid").password));
  await assert.rejects(supervisor.createSupervisorAccountHandler(request), { code: "already-exists" });
  verifiedUid = "supervisor-uid";
  const previousFetch = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ idToken: "verified-token" }) });
  try {
    await passwordChange.completePasswordChangeHandler({ auth: { uid: "supervisor-uid" }, data: {
      currentPassword: accounts.get("supervisor-uid").password, newPassword: "NewPassword1!", apiKey: "key",
    } });
    assert.equal(docs.get("users/supervisor-uid").mustChangePassword, false);
    assert.equal(docs.get("supervisors/supervisor-uid").mustChangePassword, false);
  } finally { global.fetch = previousFetch; }
});

test("supervisor creation rejects unauthorized and invalid assignments and reports SMTP failure", async () => {
  setup();
  docs.set("users/coord", { role: "coordinator", department: "BSIT" });
  docs.set("students/roster", { coordinatorUid: "other", departmentId: "BSIT" });
  const request = { auth: { uid: "coord" }, data: {
    firstName: "Ada", lastName: "Supervisor", email: "supervisor@gmail.com",
    company: "Company", schoolYear: "2025-2026", assignedStudentRecordIds: ["roster"], role: "admin",
  } };
  await assert.rejects(supervisor.createSupervisorAccountHandler({ ...request, auth: { uid: "admin" } }), { code: "permission-denied" });
  await assert.rejects(supervisor.createSupervisorAccountHandler(request), { code: "failed-precondition" });
  assert.equal(accounts.size, 0);
  assert.equal(docs.has("users/supervisor-uid"), false);
  docs.get("students/roster").coordinatorUid = "coord";
  failWrites = true;
  await assert.rejects(supervisor.createSupervisorAccountHandler(request), { code: "internal" });
  assert.equal(accounts.size, 0);
  failWrites = false;
  failEmail = true;
  const result = await supervisor.createSupervisorAccountHandler(request);
  assert.equal(result.emailStatus, "Failed");
  assert.equal(docs.get("users/supervisor-uid").accountNotificationStatus, "Failed");
  assert.equal(docs.get("users/supervisor-uid").role, "supervisor");
  const firstPassword = accounts.get("supervisor-uid").password;
  await assert.rejects(supervisor.resendSupervisorNotificationHandler({
    auth: { uid: "admin" }, data: { uid: "supervisor-uid" },
  }), { code: "permission-denied" });
  failEmail = false;
  const retry = await supervisor.resendSupervisorNotificationHandler({
    auth: { uid: "coord" }, data: { uid: "supervisor-uid" },
  });
  assert.equal(retry.emailStatus, "Sent");
  assert.notEqual(accounts.get("supervisor-uid").password, firstPassword);
  assert.ok(messages[0].text.includes(accounts.get("supervisor-uid").password));
  await assert.rejects(supervisor.resendSupervisorNotificationHandler({
    auth: { uid: "coord" }, data: { uid: "supervisor-uid" },
  }), { code: "failed-precondition" });
});
