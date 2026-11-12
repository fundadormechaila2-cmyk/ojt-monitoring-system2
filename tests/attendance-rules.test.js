import assert from "node:assert/strict";
import process from "node:process";
import { test } from "node:test";
import { deleteApp, initializeApp } from "firebase/app";
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  terminate,
  where,
} from "firebase/firestore";

test("coordinators and students can read only authorized attendance", async (t) => {
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  assert.ok(emulator, "Run this test against the Firestore emulator only.");
  const projectId = "demo-settings";
  const [host, port] = emulator.split(":");
  const apps = [];
  const databases = [];
  t.after(async () => {
    await Promise.all(databases.map((database) => terminate(database)));
    await Promise.all(apps.map((app) => deleteApp(app)));
  });

  async function seed(path, values) {
    const fields = Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, { stringValue: value }]),
    );
    const response = await fetch(
      `http://${emulator}/v1/projects/${projectId}/databases/(default)/documents/${path}`,
      {
        method: "PATCH",
        headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      },
    );
    assert.ok(response.ok, `Unable to seed emulator: ${await response.text()}`);
  }

  function databaseFor(uid) {
    const app = initializeApp({ projectId }, uid);
    const database = getFirestore(app);
    connectFirestoreEmulator(database, host, Number(port), { mockUserToken: { sub: uid } });
    apps.push(app);
    databases.push(database);
    return database;
  }

  await Promise.all([
    seed("users/coordinator-a", { role: "coordinator", departmentId: "BSBA" }),
    seed("users/coordinator-b", { role: "coordinator", departmentId: "BSBA" }),
    seed("users/previous", { role: "coordinator", departmentId: "BSBA" }),
    seed("users/no-department", { role: "coordinator" }),
    seed("users/legacy-coordinator", { role: "coordinator", department: "Bachelor of Science in Business Administration (BSBA)" }),
    seed("users/legacy-bsit", { role: "coordinator", department: "BSIT" }),
    seed("users/student-a", { role: "student", coordinatorUid: "coordinator-a", departmentId: "BSBA", studentRecordId: "a" }),
    seed("users/student-b", { role: "student", coordinatorUid: "coordinator-b", departmentId: "BSBA", studentRecordId: "b" }),
    seed("users/student-other", { role: "student", coordinatorUid: "coordinator-a", departmentId: "BSIT", studentRecordId: "other" }),
    seed("users/student-missing", { role: "student", coordinatorUid: "coordinator-a", studentRecordId: "missing" }),
    seed("users/student-stale", { role: "student", coordinatorUid: "coordinator-a", departmentId: "BSBA", studentRecordId: "stale" }),
    seed("users/legacy-student", { role: "student", coordinatorUid: "legacy-coordinator", departmentId: "BSBA", studentRecordId: "legacy" }),
    seed("users/legacy-other", { role: "student", coordinatorUid: "legacy-coordinator", departmentId: "BSIT", studentRecordId: "legacy-other" }),
    seed("users/legacy-it-student", { role: "student", coordinatorUid: "legacy-bsit", departmentId: "BSIT", studentRecordId: "legacy-it" }),
    seed("students/a", { coordinatorUid: "coordinator-a", departmentId: "BSBA", studentUid: "student-a" }),
    seed("students/b", { coordinatorUid: "coordinator-b", departmentId: "BSBA", studentUid: "student-b" }),
    seed("students/other", { coordinatorUid: "coordinator-a", departmentId: "BSIT", studentUid: "student-other" }),
    seed("students/missing", { coordinatorUid: "coordinator-a", studentUid: "student-missing" }),
    seed("students/stale", { coordinatorUid: "coordinator-b", departmentId: "BSBA", studentUid: "student-stale" }),
    seed("students/legacy", { coordinatorUid: "legacy-coordinator", departmentId: "BSBA", studentUid: "legacy-student" }),
    seed("students/legacy-other", { coordinatorUid: "legacy-coordinator", departmentId: "BSIT", studentUid: "legacy-other" }),
    seed("students/legacy-it", { coordinatorUid: "legacy-bsit", departmentId: "BSIT", studentUid: "legacy-it-student" }),
    seed("attendance/a-current", { studentUid: "student-a", coordinatorUid: "coordinator-a", date: "2026-01-02" }),
    seed("attendance/a-previous", { studentUid: "student-a", coordinatorUid: "previous", date: "2026-01-01" }),
    seed("attendance/b-current", { studentUid: "student-b", coordinatorUid: "coordinator-b", date: "2026-01-02" }),
    seed("attendance/other", { studentUid: "student-other", date: "2026-01-02" }),
    seed("attendance/missing", { studentUid: "student-missing", date: "2026-01-02" }),
    seed("attendance/stale", { studentUid: "student-stale", date: "2026-01-02" }),
    seed("attendance/legacy", { studentUid: "legacy-student", date: "2026-01-02" }),
    seed("attendance/legacy-other", { studentUid: "legacy-other", date: "2026-01-02" }),
    seed("attendance/legacy-it", { studentUid: "legacy-it-student", date: "2026-01-02" }),
  ]);
  const coordinator = databaseFor("coordinator-a");
  const previousCoordinator = databaseFor("previous");
  const noDepartment = databaseFor("no-department");
  const legacyCoordinator = databaseFor("legacy-coordinator");
  const legacyIt = databaseFor("legacy-bsit");
  const student = databaseFor("student-a");
  const studentQuery = (database, uid) => getDocs(query(collection(database, "attendance"), where("studentUid", "==", uid)));
  const ids = (snapshot) => snapshot.docs.map((item) => item.id).sort();

  assert.deepEqual(ids(await studentQuery(student, "student-a")), ["a-current", "a-previous"]);
  assert.deepEqual(ids(await studentQuery(coordinator, "student-a")), ["a-current", "a-previous"]);
  await assert.rejects(studentQuery(coordinator, "student-b"), { code: "permission-denied" });
  await assert.rejects(getDoc(doc(coordinator, "attendance", "b-current")), { code: "permission-denied" });
  await assert.rejects(getDoc(doc(previousCoordinator, "attendance", "a-previous")), { code: "permission-denied" });
  await assert.rejects(studentQuery(previousCoordinator, "student-a"), { code: "permission-denied" });
  await assert.rejects(studentQuery(student, "student-b"), { code: "permission-denied" });
  await assert.rejects(studentQuery(coordinator, "student-other"), { code: "permission-denied" });
  await assert.rejects(studentQuery(coordinator, "student-missing"), { code: "permission-denied" });
  await assert.rejects(studentQuery(coordinator, "student-stale"), { code: "permission-denied" });
  await assert.rejects(studentQuery(noDepartment, "student-a"), { code: "permission-denied" });
  assert.deepEqual(ids(await getDocs(query(collection(coordinator, "students"),
    where("coordinatorUid", "==", "coordinator-a"), where("departmentId", "==", "BSBA")))), ["a"]);
  await assert.rejects(getDoc(doc(coordinator, "students", "other")), { code: "permission-denied" });
  await assert.rejects(getDoc(doc(coordinator, "students", "missing")), { code: "permission-denied" });
  await assert.rejects(getDoc(doc(coordinator, "students", "b")), { code: "permission-denied" });
  await assert.rejects(getDocs(query(collection(coordinator, "students"),
    where("coordinatorUid", "==", "coordinator-a"))), { code: "permission-denied" });
  assert.deepEqual(ids(await getDocs(query(collection(legacyCoordinator, "students"),
    where("coordinatorUid", "==", "legacy-coordinator"), where("departmentId", "==", "BSBA")))), ["legacy"]);
  assert.deepEqual(ids(await studentQuery(legacyCoordinator, "legacy-student")), ["legacy"]);
  await assert.rejects(studentQuery(legacyCoordinator, "legacy-other"), { code: "permission-denied" });
  await assert.rejects(getDoc(doc(legacyCoordinator, "students", "legacy-other")), { code: "permission-denied" });
  assert.deepEqual(ids(await studentQuery(legacyIt, "legacy-it-student")), ["legacy-it"]);
});
