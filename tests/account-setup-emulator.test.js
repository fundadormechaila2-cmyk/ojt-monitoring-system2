import assert from "node:assert/strict";
import process from "node:process";
import { test } from "node:test";
import { createServer } from "vite";
import {
  confirmPasswordReset,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { connectFirestoreEmulator, doc, getDoc, setDoc, terminate, updateDoc } from "firebase/firestore";
import { deleteApp } from "firebase/app";

test("admins create separate accounts and Firebase setup links work", async (t) => {
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

  const admin = await createUserWithEmailAndPassword(firebase.auth, "admin@example.test", "TestAdmin1!");
  async function seed(path, fields) {
    const response = await fetch(
      `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/${path}`,
      {
        method: "PATCH",
        headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      },
    );
    assert.ok(response.ok, `Unable to seed emulator: ${response.status}`);
  }
  await seed(`users/${admin.user.uid}`, { role: { stringValue: "admin" } });
  await seed("students/roster", {
    course: { stringValue: "BSIT" },
    studentId: { stringValue: "123" },
  });
  const student = await service.createManagedUser({
    firstName: "Ada", lastName: "Student", email: "student@example.test",
    role: "student", studentRecordId: "roster", studentId: "123",
    course: "BSIT", createdBy: admin.user.uid,
  });
  const coordinator = await service.createCoordinatorLoginAccount({
    fullName: "Alex Coordinator", email: "coordinator@example.test",
    department: "BSIT", createdBy: admin.user.uid,
  });
  assert.equal(student.emailStatus, "Sent");
  assert.equal(coordinator.emailStatus, "Sent");
  assert.equal(firebase.auth.currentUser.uid, admin.user.uid);
  assert.equal((await getDoc(doc(firebase.db, "students", "roster"))).data().studentUid, student.uid);
  assert.equal((await getDoc(doc(firebase.db, "studentsAccount", student.uid))).data().role, "student");
  assert.equal((await getDoc(doc(firebase.db, "coordinatorsAccount", coordinator.uid))).data().role, "coordinator");
  assert.equal((await getDoc(doc(firebase.db, "coordinatorsAccount", student.uid))).exists(), false);
  assert.equal((await getDoc(doc(firebase.db, "studentsAccount", coordinator.uid))).exists(), false);
  assert.equal((await service.resendStudentAccountNotification("roster")).emailStatus, "Sent");
  assert.equal((await service.resendCoordinatorSetupEmail(coordinator.uid)).emailStatus, "Sent");

  const codesResponse = await fetch(`http://${authHost}/emulator/v1/projects/${projectId}/oobCodes`);
  assert.ok(codesResponse.ok);
  const { oobCodes } = await codesResponse.json();
  for (const account of [student, coordinator]) {
    const setup = oobCodes.find((item) => item.email === account.email && item.requestType === "PASSWORD_RESET");
    assert.ok(setup, `Missing setup link for ${account.role}`);
    await confirmPasswordReset(secondaryAuth, setup.oobCode, "NewPassword1!");
    const login = await signInWithEmailAndPassword(secondaryAuth, account.email, "NewPassword1!");
    assert.equal(login.user.uid, account.uid);
    await signOut(secondaryAuth);
  }
  await assert.rejects(service.createManagedUser({
    firstName: "Duplicate", lastName: "Student", email: student.email,
    role: "student", studentRecordId: "other", createdBy: admin.user.uid,
  }), /already registered/i);
  await assert.rejects(service.createManagedUser({
    firstName: "Missing", lastName: "Roster", email: "missing@example.test",
    role: "student", studentRecordId: "missing", createdBy: admin.user.uid,
  }), /roster record no longer exists/i);
  await assert.rejects(signInWithEmailAndPassword(secondaryAuth, "missing@example.test", "NewPassword1!"));
  await signOut(firebase.auth);
  await signInWithEmailAndPassword(firebase.auth, student.email, "NewPassword1!");
  assert.equal((await getDoc(doc(firebase.db, "studentsAccount", student.uid))).data().role, "student");
  await assert.rejects(setDoc(doc(firebase.db, "coordinatorsAccount", student.uid), {
    role: "coordinator",
  }), { code: "permission-denied" });
  await assert.rejects(service.createCoordinatorLoginAccount({
    fullName: "Not Admin", email: "other@example.test", department: "BSIT", createdBy: admin.user.uid,
  }), /sign in as an administrator/i);
  await signOut(firebase.auth);
  await signInWithEmailAndPassword(firebase.auth, coordinator.email, "NewPassword1!");
  await seed(`users/${coordinator.uid}`, {
    role: { stringValue: "coordinator" },
    department: { stringValue: "BSIT" },
    departmentId: { stringValue: "BSIT" },
  });
  await assert.rejects(service.createManagedUser({
    firstName: "Legacy", lastName: "Supervisor", email: "supervisor@example.test",
    role: "supervisor", department: "BSIT", createdBy: coordinator.uid,
  }), /do not have permission to create this user/i);
  const pendingSupervisor = await createUserWithEmailAndPassword(secondaryAuth, "pending@gmail.com", "TempPassword1!");
  await seed(`users/${pendingSupervisor.user.uid}`, {
    role: { stringValue: "supervisor" }, mustChangePassword: { booleanValue: true },
  });
  await seed("partnerCompanies/example", { name: { stringValue: "Example" } });
  await signOut(firebase.auth);
  await signInWithEmailAndPassword(firebase.auth, "pending@gmail.com", "TempPassword1!");
  assert.equal((await getDoc(doc(firebase.db, "users", pendingSupervisor.user.uid))).data().mustChangePassword, true);
  await assert.rejects(updateDoc(doc(firebase.db, "users", pendingSupervisor.user.uid), {
    mustChangePassword: false,
  }), { code: "permission-denied" });
  await assert.rejects(getDoc(doc(firebase.db, "partnerCompanies", "example")), { code: "permission-denied" });
});
