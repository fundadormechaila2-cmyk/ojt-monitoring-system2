import assert from "node:assert/strict";
import process from "node:process";
import { test } from "node:test";
import { createServer } from "vite";
import {
  confirmPasswordReset, connectAuthEmulator, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut,
} from "firebase/auth";
import { connectFirestoreEmulator, doc, getDoc, setDoc, terminate } from "firebase/firestore";
import { deleteApp } from "firebase/app";

test("coordinator creates a supervisor and sends a password setup link", async (t) => {
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
  assert.ok(authHost && firestoreHost, "Run this test with both Firebase Auth and Firestore emulators.");
  const projectId = "demo-account-setup";
  process.env.VITE_FIREBASE_PROJECT_ID = projectId;
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  const firebase = await vite.ssrLoadModule("/src/services/firebase.jsx");
  const { secondaryAuth } = await vite.ssrLoadModule("/src/services/secondatyAuth.js");
  const service = await vite.ssrLoadModule("/src/services/userManagementSevice.js");
  const [host, port] = firestoreHost.split(":");
  connectAuthEmulator(firebase.auth, `http://${authHost}`, { disableWarnings: true });
  connectAuthEmulator(secondaryAuth, `http://${authHost}`, { disableWarnings: true });
  connectFirestoreEmulator(firebase.db, host, Number(port));
  t.after(async () => {
    await terminate(firebase.db);
    await deleteApp(secondaryAuth.app);
    await deleteApp(firebase.app);
    await vite.close();
  });
  async function seed(path, fields) {
    const response = await fetch(`http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/${path}`, {
      method: "PATCH",
      headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    });
    assert.ok(response.ok, `Unable to seed emulator: ${response.status}`);
  }
  const coordinator = (await createUserWithEmailAndPassword(firebase.auth, "coord@example.test", "TestPassword1!")).user;
  await seed(`users/${coordinator.uid}`, {
    role: { stringValue: "coordinator" }, department: { stringValue: "BSIT" }, departmentId: { stringValue: "BSIT" },
  });
  const linked = (await createUserWithEmailAndPassword(secondaryAuth, "student@example.test", "TestPassword1!")).user;
  await signOut(secondaryAuth);
  await seed("students/supervised", {
    coordinatorUid: { stringValue: coordinator.uid }, departmentId: { stringValue: "BSIT" },
    schoolYear: { stringValue: "2026-2027" }, studentUid: { stringValue: linked.uid },
  });
  await seed(`users/${linked.uid}`, {
    role: { stringValue: "student" }, coordinatorUid: { stringValue: coordinator.uid }, studentRecordId: { stringValue: "supervised" },
  });
  await seed(`studentsAccount/${linked.uid}`, {
    role: { stringValue: "student" }, coordinatorUid: { stringValue: coordinator.uid },
  });
  const missingMirror = (await createUserWithEmailAndPassword(secondaryAuth, "student2@example.test", "TestPassword1!")).user;
  await signOut(secondaryAuth);
  await seed("students/no-mirror", {
    coordinatorUid: { stringValue: coordinator.uid }, departmentId: { stringValue: "BSIT" },
    schoolYear: { stringValue: "2026-2027" }, studentUid: { stringValue: missingMirror.uid },
  });
  await seed(`users/${missingMirror.uid}`, {
    role: { stringValue: "student" }, coordinatorUid: { stringValue: coordinator.uid }, studentRecordId: { stringValue: "no-mirror" },
  });
  const extraIds = Array.from({ length: 163 }, (_, index) => `extra-${index}`);
  await Promise.all(extraIds.map((id) => seed(`students/${id}`, {
    coordinatorUid: { stringValue: coordinator.uid }, departmentId: { stringValue: "BSIT" },
    schoolYear: { stringValue: "2026-2027" },
  })));
  const request = {
    firstName: "Sam", lastName: "Supervisor", email: "supervisor@gmail.com",
    company: "Example", schoolYear: "2026-2027", assignedStudentRecordIds: ["supervised", "no-mirror", ...extraIds],
  };
  await assert.rejects(service.createSupervisorAccount({
    ...request, assignedStudentRecordIds: [...request.assignedStudentRecordIds, "too-many"],
  }), /assigned students/i);
  const supervisor = await service.createSupervisorAccount(request);
  assert.equal(supervisor.emailStatus, "Sent");
  assert.equal(firebase.auth.currentUser.uid, coordinator.uid);
  for (const path of ["students/supervised", `users/${linked.uid}`, `studentsAccount/${linked.uid}`, "students/no-mirror", `users/${missingMirror.uid}`, "students/extra-162"]) {
    assert.equal((await getDoc(doc(firebase.db, path))).data().supervisorUid, supervisor.uid);
  }
  assert.equal((await getDoc(doc(firebase.db, "studentsAccount", missingMirror.uid))).exists(), false);
  for (const collectionName of ["users", "supervisorsAccount", "supervisors"]) {
    const profile = (await getDoc(doc(firebase.db, collectionName, supervisor.uid))).data();
    assert.equal(profile.role, "supervisor");
    assert.equal(profile.mustChangePassword, false);
    assert.equal(profile.accountNotificationStatus, "Sent");
    assert.equal("password" in profile, false);
  }
  assert.equal((await service.resendSupervisorAccountNotification(supervisor.uid)).emailStatus, "Sent");
  const codes = await (await fetch(`http://${authHost}/emulator/v1/projects/${projectId}/oobCodes`)).json();
  const link = codes.oobCodes.find((item) => item.email === supervisor.email && item.requestType === "PASSWORD_RESET");
  assert.ok(link);
  await confirmPasswordReset(secondaryAuth, link.oobCode, "NewPassword1!");
  assert.equal((await signInWithEmailAndPassword(secondaryAuth, supervisor.email, "NewPassword1!")).user.uid, supervisor.uid);
  await signOut(secondaryAuth);
  await assert.rejects(service.createSupervisorAccount({ ...request, email: "other@gmail.com" }), /already assigned/i);
  await assert.rejects(setDoc(doc(firebase.db, "users", "forged-supervisor"), {
    uid: "forged-supervisor", role: "admin", department: "BSIT", createdBy: coordinator.uid,
  }), { code: "permission-denied" });
});
