/*
 * Migrates existing Firestore data to the shared BSBA department model.
 *
 *   node scripts/migrateBsbaDepartment.js                  # dry run (default)
 *   node scripts/migrateBsbaDepartment.js --apply          # write changes
 *   node scripts/migrateBsbaDepartment.js --apply --primary=<coordinatorUid>
 *
 * Additive only; nothing is deleted:
 *  - Adds department / departmentId to coordinators and supervisors
 *    (both BSBA majors become "BSBA").
 *  - Adds department / departmentId / major to students and student profiles
 *    while keeping the original course untouched.
 *  - If more than one BSBA coordinator exists, no student is reassigned.
 *    Re-run with --primary=<uid> to move all BSBA students (and their
 *    attendance, applications, evaluations and login activity) to that
 *    coordinator. Other coordinator accounts are left for you to deactivate.
 *  - On --apply, previous values of every touched document are saved to a
 *    backup JSON file next to this script.
 *
 * Use GOOGLE_APPLICATION_CREDENTIALS (or FIRESTORE_EMULATOR_HOST) for access.
 */
const fs = require("node:fs");
const path = require("node:path");
const { initializeApp } = require("firebase-admin/app");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const { departmentIdFor, recordDepartmentId } = require("../departments");

const LABELS = {
  BSIT: "Bachelor of Science in Information Technology",
  BSHM: "Bachelor of Science in Hospitality Management",
  BSBA: "Bachelor of Science in Business Administration (BSBA)",
  BSED: "Bachelor of Science in Secondary Education",
  BEED: "Bachelor of Science in Elementary Education",
};

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const primaryUid = (args.find((arg) => arg.startsWith("--primary=")) || "").split("=")[1] || "";

initializeApp();
const db = getFirestore();

function majorFor(course) {
  const raw = String(course || "").toLowerCase();
  if (raw === "bsba-fm" || raw.includes("financial management")) return "BSBA-FM";
  if (raw === "bsba-mm" || raw.includes("marketing management")) return "BSBA-MM";
  return "";
}

function isLive(data) {
  return (
    data.isActive !== false &&
    data.isArchived !== true &&
    !["INACTIVE", "ARCHIVED"].includes(String(data.status || "ACTIVE").toUpperCase())
  );
}

const pending = new Map();
function queue(doc, changes) {
  const data = doc.data();
  const effective = Object.fromEntries(
    Object.entries(changes).filter(([key, value]) => data[key] !== value),
  );
  if (Object.keys(effective).length === 0) return;
  const existing = pending.get(doc.ref.path);
  const before = existing?.before || {};
  Object.keys(effective).forEach((key) => {
    if (!(key in before)) before[key] = data[key] === undefined ? null : data[key];
  });
  pending.set(doc.ref.path, {
    ref: doc.ref,
    changes: { ...(existing?.changes || {}), ...effective },
    before,
  });
}

async function main() {
  console.log(apply ? "APPLY mode" : "DRY RUN (no writes). Use --apply to write.");

  const [usersSnap, studentsSnap] = await Promise.all([
    db.collection("users").get(),
    db.collection("students").get(),
  ]);
  const users = usersSnap.docs;
  const students = studentsSnap.docs;

  const bsbaCoordinators = users.filter((doc) => {
    const data = doc.data();
    return data.role === "coordinator" && recordDepartmentId(data) === "BSBA" && isLive(data);
  });

  let target = null;
  if (primaryUid) {
    target = bsbaCoordinators.find((doc) => doc.id === primaryUid);
    if (!target) throw new Error(`--primary=${primaryUid} is not an active BSBA coordinator.`);
  } else if (bsbaCoordinators.length === 1) {
    target = bsbaCoordinators[0];
  } else if (bsbaCoordinators.length > 1) {
    console.warn(
      `Found ${bsbaCoordinators.length} BSBA coordinators:\n` +
        bsbaCoordinators
          .map((doc) => `  ${doc.id}  ${doc.data().email || ""}  ${doc.data().department || ""}`)
          .join("\n") +
        "\nStudents will NOT be reassigned. Re-run with --primary=<uid> to consolidate.",
    );
  } else {
    console.warn("No active BSBA coordinator found. Students keep their current assignment.");
  }
  const targetData = target?.data() || {};
  const targetName =
    `${targetData.firstName || ""} ${targetData.lastName || ""}`.trim() || targetData.email || "";

  for (const doc of users) {
    const data = doc.data();
    if (!["coordinator", "supervisor"].includes(data.role)) continue;
    const id = recordDepartmentId(data);
    if (id) queue(doc, { department: LABELS[id], departmentId: id });
  }

  const reassignedUids = new Set();
  const reassignedStudentIds = new Set();
  const stampStudent = (doc, uid) => {
    const data = doc.data();
    const id = departmentIdFor(data.course) || recordDepartmentId(data);
    if (!id) return;
    const major = majorFor(data.course);
    const changes = {
      department: LABELS[id],
      departmentId: id,
      ...(major ? { major } : {}),
    };
    if (id === "BSBA" && target && data.coordinatorUid !== target.id) {
      changes.coordinatorUid = target.id;
      if (targetName) changes.coordinatorName = targetName;
      if (uid) reassignedUids.add(uid);
      if (data.studentId) reassignedStudentIds.add(String(data.studentId));
    }
    queue(doc, changes);
  };
  students.forEach((doc) => stampStudent(doc, doc.data().studentUid));
  users.filter((doc) => doc.data().role === "student").forEach((doc) => stampStudent(doc, doc.id));

  if (target && (reassignedUids.size || reassignedStudentIds.size)) {
    for (const name of ["attendance", "applications", "evaluations", "studentLoginActivity"]) {
      const snapshot = await db.collection(name).get();
      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        const uid = data.studentUid || data.userId;
        const matches = uid
          ? reassignedUids.has(uid)
          : data.studentId && reassignedStudentIds.has(String(data.studentId));
        if (matches && data.coordinatorUid !== target.id) {
          queue(doc, { coordinatorUid: target.id });
        }
      });
    }
  }

  const byCollection = {};
  pending.forEach((_, key) => {
    const name = key.split("/")[0];
    byCollection[name] = (byCollection[name] || 0) + 1;
  });
  console.log(`Documents to update: ${pending.size}`, byCollection);

  if (!apply || pending.size === 0) return;

  const backupFile = path.join(__dirname, `bsba-migration-backup-${Date.now()}.json`);
  fs.writeFileSync(
    backupFile,
    JSON.stringify(
      [...pending.entries()].map(([docPath, item]) => ({ path: docPath, before: item.before })),
      null,
      2,
    ),
  );
  console.log(`Backup written to ${backupFile}`);

  const entries = [...pending.values()];
  for (let offset = 0; offset < entries.length; offset += 400) {
    const batch = db.batch();
    entries.slice(offset, offset + 400).forEach((item) => {
      batch.update(item.ref, { ...item.changes, updatedAt: FieldValue.serverTimestamp() });
    });
    await batch.commit();
  }
  console.log("Migration complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
