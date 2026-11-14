const ROLE_COLLECTIONS = {
  coordinator: "coordinatorsAccount",
  supervisor: "supervisorsAccount",
  student: "studentsAccount",
};

// Credentials never belong in the role profile collections.
const SECRET_FIELDS = ["temporaryPassword", "password"];

function roleCollectionFor(role) {
  return ROLE_COLLECTIONS[role] || null;
}

function roleAccountRef(db, role, uid) {
  const collectionName = roleCollectionFor(role);
  return collectionName && uid ? db.collection(collectionName).doc(uid) : null;
}

function toRoleProfile(profile, uid) {
  const clean = { ...profile, uid };
  SECRET_FIELDS.forEach((field) => delete clean[field]);
  return clean;
}

module.exports = { ROLE_COLLECTIONS, roleCollectionFor, roleAccountRef, toRoleProfile };
