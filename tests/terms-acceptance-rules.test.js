import assert from "node:assert/strict";
import process from "node:process";
import { test } from "node:test";
import { deleteApp, initializeApp } from "firebase/app";
import {
  addDoc,
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  getDocs,
  getFirestore,
  Timestamp,
  limit,
  query,
  serverTimestamp,
  terminate,
  updateDoc,
  where,
} from "firebase/firestore";

test("users can create immutable Terms acceptance records only for themselves", async (t) => {
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

  async function seed(uid, role) {
    const response = await fetch(
      `http://${emulator}/v1/projects/${projectId}/databases/(default)/documents/users/${uid}`,
      {
        method: "PATCH",
        headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
        body: JSON.stringify({ fields: { role: { stringValue: role } } }),
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

  const roles = ["admin", "coordinator", "supervisor", "student"];
  await Promise.all([...roles.map((role) => seed(role, role)), seed("student-a", "student"), seed("student-b", "student")]);
  const version = "lcc-ojt-2026-11-18-v1";
  const oldAcceptance = await fetch(
    `http://${emulator}/v1/projects/${projectId}/databases/(default)/documents/users/student/termsAcceptances/previous`,
    {
      method: "PATCH",
      headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
      body: JSON.stringify({ fields: {
        version: { stringValue: "lcc-ojt-draft-2026-11-v1" },
        acceptedAt: { timestampValue: "2026-11-18T00:00:00Z" },
      } }),
    },
  );
  assert.ok(oldAcceptance.ok, `Unable to seed old acceptance: ${await oldAcceptance.text()}`);
  for (const role of roles) {
    const database = databaseFor(role);
    const records = collection(database, "users", role, "termsAcceptances");
    const currentVersion = query(records, where("version", "==", version), limit(1));
    assert.equal((await getDocs(currentVersion)).empty, true, `${role} initially requires acceptance`);
    await addDoc(records, { version, accepted: true, acceptedAt: serverTimestamp() });
    const saved = await getDocs(currentVersion);
    assert.equal(saved.size, 1, `${role} retains acceptance for this version`);
    assert.equal(saved.docs[0].data().version, version);
    assert.equal(saved.docs[0].data().accepted, true);
    assert.ok(saved.docs[0].data().acceptedAt instanceof Timestamp);
    assert.equal((await getDocs(query(records, where("version", "==", "future-version"), limit(1)))).empty, true);
  }
  const student = databaseFor("student-a");
  const otherStudent = databaseFor("student-b");
  const ownRecords = collection(student, "users", "student-a", "termsAcceptances");
  const denied = (promise) => assert.rejects(promise, { code: "permission-denied" });
  const acceptedRecord = await addDoc(ownRecords, {
    version,
    accepted: true,
    acceptedAt: serverTimestamp(),
  });

  assert.equal((await getDocs(ownRecords)).size, 1);
  assert.equal((await getDocs(query(
    ownRecords,
    where("version", "==", version),
    limit(1),
  ))).size, 1);
  assert.equal((await getDocs(query(
    ownRecords,
    where("version", "==", "lcc-ojt-draft-2026-11-v2"),
    limit(1),
  ))).size, 0);
  await denied(addDoc(collection(student, "users", "student-b", "termsAcceptances"), {
    version,
    accepted: true,
    acceptedAt: serverTimestamp(),
  }));
  await denied(addDoc(ownRecords, {
    version: "unapproved-version",
    accepted: true,
    acceptedAt: serverTimestamp(),
  }));
  await denied(addDoc(ownRecords, {
    version,
    accepted: false,
    acceptedAt: serverTimestamp(),
  }));
  await denied(addDoc(ownRecords, {
    version,
    accepted: true,
    acceptedAt: new Date("2020-01-01T00:00:00Z"),
  }));
  await denied(addDoc(ownRecords, {
    version,
    accepted: true,
    acceptedAt: serverTimestamp(),
    email: "student@example.test",
  }));
  await denied(updateDoc(acceptedRecord, { version: "changed" }));
  await denied(deleteDoc(acceptedRecord));
  await denied(getDocs(collection(otherStudent, "users", "student-a", "termsAcceptances")));
});
