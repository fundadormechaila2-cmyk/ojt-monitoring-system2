import assert from "node:assert/strict";
import process from "node:process";
import { test } from "node:test";
import { deleteApp, initializeApp } from "firebase/app";
import {
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc,
  terminate,
  updateDoc,
} from "firebase/firestore";

test("settings updates are restricted to each authorized user's profile fields", async (t) => {
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

  async function seed(uid, role, mustChangePassword = false) {
    const response = await fetch(
      `http://${emulator}/v1/projects/${projectId}/databases/(default)/documents/users/${uid}`,
      {
        method: "PATCH",
        headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: {
            role: { stringValue: role },
            mustChangePassword: { booleanValue: mustChangePassword },
            firstName: { stringValue: "First" },
            lastName: { stringValue: "Last" },
            contactNumber: { stringValue: "" },
          },
        }),
      },
    );
    assert.ok(response.ok, `Unable to seed emulator: ${await response.text()}`);
  }

  function databaseFor(uid) {
    const app = initializeApp({ projectId }, uid);
    const database = getFirestore(app);
    connectFirestoreEmulator(database, host, Number(port), {
      mockUserToken: { sub: uid },
    });
    apps.push(app);
    databases.push(database);
    return database;
  }

  await Promise.all([
    seed("admin", "admin"),
    seed("coordinator", "coordinator"),
    seed("supervisor", "supervisor"),
    seed("student", "student"),
    seed("pending-coordinator", "coordinator", true),
    seed("pending-student", "student", true),
  ]);
  const admin = databaseFor("admin");
  const coordinator = databaseFor("coordinator");
  const supervisor = databaseFor("supervisor");
  const student = databaseFor("student");
  const pendingCoordinator = databaseFor("pending-coordinator");
  const pendingStudent = databaseFor("pending-student");
  const profileUpdate = () => ({
    firstName: "Updated",
    lastName: "Name",
    contactNumber: "123",
    updatedAt: serverTimestamp(),
  });
  const denied = (promise) => assert.rejects(promise, { code: "permission-denied" });

  for (const [database, uid] of [[admin, "admin"], [coordinator, "coordinator"], [supervisor, "supervisor"]]) {
    await updateDoc(doc(database, "users", uid), profileUpdate());
  }

  await denied(updateDoc(doc(coordinator, "users", "supervisor"), profileUpdate()));
  await denied(updateDoc(doc(supervisor, "users", "coordinator"), profileUpdate()));
  await denied(updateDoc(doc(student, "users", "student"), profileUpdate()));
  await denied(updateDoc(doc(coordinator, "users", "coordinator"), {
    ...profileUpdate(),
    role: "admin",
  }));
  await denied(updateDoc(doc(supervisor, "users", "supervisor"), {
    ...profileUpdate(),
    email: "other@example.test",
  }));
  await denied(updateDoc(doc(supervisor, "users", "supervisor"), {
    ...profileUpdate(),
    firstName: 123,
  }));
  await denied(updateDoc(doc(coordinator, "users", "coordinator"), {
    ...profileUpdate(),
    updatedAt: new Date("2000-01-01T00:00:00Z"),
  }));
  assert.equal((await getDoc(doc(pendingStudent, "users", "pending-student"))).exists(), true);
  await denied(updateDoc(doc(pendingStudent, "users", "pending-student"), {
    mustChangePassword: false,
  }));
  await denied(setDoc(doc(pendingCoordinator, "users", "new-supervisor"), {
    role: "supervisor",
    createdBy: "pending-coordinator",
    departmentId: "BSIT",
  }));
  await denied(getDoc(doc(pendingStudent, "students", "pending-student")));
});
