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
import { supervisorDirectoryQuery } from "../src/services/supervisorDirectoryQuery.js";

test("coordinators can list only supervisors in their exact department", async (t) => {
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  assert.ok(emulator, "Run this test against the Firestore emulator.");
  const projectId = "demo-supervisor";
  const [host, port] = emulator.split(":");
  const app = initializeApp({ projectId }, "supervisor-rules-test");
  const db = getFirestore(app);
  connectFirestoreEmulator(db, host, Number(port), { mockUserToken: { sub: "coordinator-a" } });
  t.after(async () => { await terminate(db); await deleteApp(app); });

  async function seed(id, role, department) {
    const response = await fetch(
      `http://${emulator}/v1/projects/${projectId}/databases/(default)/documents/users/${id}`,
      {
        method: "PATCH",
        headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
        body: JSON.stringify({ fields: {
          role: { stringValue: role }, department: { stringValue: department },
        } }),
      },
    );
    assert.ok(response.ok, `Unable to seed emulator: ${response.status}`);
  }
  await Promise.all([
    seed("coordinator-a", "coordinator", "BSIT"),
    seed("supervisor-a", "supervisor", "BSIT"),
    seed("supervisor-b", "supervisor", "BSHM"),
    seed("student-a", "student", "BSIT"),
  ]);
  const results = await getDocs(supervisorDirectoryQuery(db, "BSIT"));
  assert.deepEqual(results.docs.map((item) => item.id), ["supervisor-a"]);
  await assert.rejects(getDocs(supervisorDirectoryQuery(db, "BSHM")), { code: "permission-denied" });
  await assert.rejects(getDocs(query(collection(db, "users"), where("role", "==", "supervisor"))), { code: "permission-denied" });
  await assert.rejects(getDoc(doc(db, "users", "supervisor-b")), { code: "permission-denied" });
});
