const { applicationDefault, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const profileRoles = {
  admins: "admin",
  coordinators: "coordinator",
  supervisors: "supervisor",
};

function auditCollections(collections) {
  const issues = [];
  const users = new Map(collections.users.map((item) => [item.id, item.data]));
  const studentLinks = new Map();
  const add = (collection, id, issue) => issues.push({ collection, id, issue });

  for (const [collection, role] of Object.entries(profileRoles)) {
    const profiles = new Map(collections[collection].map((item) => [item.id, item.data]));
    for (const [id, data] of profiles) {
      if (data.role !== role || (data.uid && data.uid !== id)) {
        add(collection, id, "Profile role or UID does not match its collection or document ID.");
      }
      const account = users.get(id);
      if (!account || account.role !== role) {
        add(collection, id, "Matching users account is missing or has a different role.");
      }
    }
    for (const [id, account] of users) {
      if (account.role === role && !profiles.has(id)) {
        add(collection, id, "Role profile is missing.");
      }
    }
  }

  for (const { id, data } of collections.students) {
    if (data.role && data.role !== "student") {
      add("students", id, `Non-student role: ${data.role}. Review links before moving this record.`);
      continue;
    }
    const links = [...new Set([data.studentUid, data.userUid, data.accountUid, data.uid].filter(Boolean))];
    if (links.length > 1) {
      add("students", id, "Conflicting account UID fields.");
      continue;
    }
    const uid = links[0];
    if (!uid) continue;
    const account = users.get(uid);
    if (!account || account.role !== "student") {
      add("students", id, "Linked users account is missing or is not a student.");
    } else if (account.studentRecordId && account.studentRecordId !== id) {
      add("students", id, "Linked account points to another roster record.");
    }
    const existing = studentLinks.get(uid);
    if (existing) {
      add("students", id, `Account is also linked to roster record ${existing}.`);
    } else {
      studentLinks.set(uid, id);
    }
  }

  for (const [uid, account] of users) {
    if (account.uid && account.uid !== uid) {
      add("users", uid, "Account UID does not match its document ID.");
    }
    if (account.role === "student" && !studentLinks.has(uid)) {
      add("users", uid, "Student account has no linked roster record.");
    }
    if (!["admin", "coordinator", "supervisor", "student"].includes(account.role)) {
      add("users", uid, "Account has an unsupported or missing role; review manually.");
    }
  }
  return issues;
}

async function main() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("This audit is restricted to the Firestore emulator. No live data was accessed.");
  }
  const projectId = process.env.GCLOUD_PROJECT || "demo-settings";
  initializeApp({ credential: applicationDefault(), projectId });
  const db = getFirestore();
  const names = ["users", "students", ...Object.keys(profileRoles)];
  const snapshots = await Promise.all(names.map((name) => db.collection(name).get()));
  const collections = Object.fromEntries(snapshots.map((snapshot, index) => [
    names[index],
    snapshot.docs.map((item) => ({ id: item.id, data: item.data() })),
  ]));
  const issues = auditCollections(collections);
  console.log(JSON.stringify({
    counts: Object.fromEntries(names.map((name) => [name, collections[name].length])),
    issues,
  }, null, 2));
  if (issues.length) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Role collection audit failed:", error.message);
    process.exitCode = 1;
  });
}

module.exports = { auditCollections };
