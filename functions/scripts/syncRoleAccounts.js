const { applicationDefault, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { roleCollectionFor, toRoleProfile } = require("../roleAccounts");

// Copies existing users/{uid} coordinator, supervisor and student profiles into
// their role collections. Existing role documents and users documents are never changed.
async function syncRoleAccounts(db) {
  const users = await db.collection("users").get();
  const counts = { created: 0, skipped: 0 };

  for (let offset = 0; offset < users.docs.length; offset += 400) {
    const batch = db.batch();
    let pending = 0;
    const slice = users.docs.slice(offset, offset + 400);
    const targets = slice.map((user) => {
      const collectionName = roleCollectionFor(user.data().role);
      return collectionName ? db.collection(collectionName).doc(user.id) : null;
    });
    const existing = await Promise.all(targets.map((ref) => (ref ? ref.get() : null)));

    slice.forEach((user, index) => {
      if (!targets[index]) return;
      if (existing[index].exists) {
        counts.skipped += 1;
        return;
      }
      batch.create(targets[index], toRoleProfile(user.data(), user.id));
      counts.created += 1;
      pending += 1;
    });
    if (pending > 0) await batch.commit();
  }
  return counts;
}

module.exports = { syncRoleAccounts };

if (require.main === module) {
  const projectId = process.env.GCLOUD_PROJECT || "ojt-monitoringsystem2";
  initializeApp({ credential: applicationDefault(), projectId });
  syncRoleAccounts(getFirestore())
    .then(({ created, skipped }) => {
      console.log(`Created ${created} role account document(s); skipped ${skipped} existing document(s).`);
    })
    .catch((error) => {
      console.error("Unable to sync role accounts:", error);
      process.exitCode = 1;
    });
}
