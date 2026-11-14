const { getFirestore } = require("firebase-admin/firestore");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { ROLE_COLLECTIONS, roleCollectionFor, toRoleProfile } = require("./roleAccounts");

// Keeps coordinatorsAccount / supervisorsAccount / studentsAccount in sync with
// users/{uid}. Each account lives only in the collection that matches its role.
async function mirrorRoleAccount(db, uid, after) {
  const target = roleCollectionFor(after?.role);
  const batch = db.batch();
  Object.values(ROLE_COLLECTIONS)
    .filter((collectionName) => collectionName !== target)
    .forEach((collectionName) => batch.delete(db.collection(collectionName).doc(uid)));
  if (target && after) {
    batch.set(db.collection(target).doc(uid), toRoleProfile(after, uid));
  }
  await batch.commit();
}

exports.mirrorRoleAccount = onDocumentWritten("users/{uid}", async (event) => {
  const after = event.data?.after?.exists ? event.data.after.data() : null;
  await mirrorRoleAccount(getFirestore(), event.params.uid, after);
});
