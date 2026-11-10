const STUDENT_DATA_COLLECTIONS = {
  attendance: ["studentUid", "userId", "accountUid", "studentRecordId", "studentId"],
  attendanceQrScans: ["studentUid", "userId", "accountUid", "studentRecordId", "studentId"],
  applications: ["studentUid", "userId", "accountUid", "studentRecordId", "studentId"],
  evaluations: ["studentUid", "userId", "accountUid", "studentRecordId", "studentId"],
  journals: ["studentUid", "userId", "accountUid", "studentRecordId", "studentId"],
  studentLoginActivity: ["userId", "studentUid", "accountUid", "studentRecordId", "studentId"],
};

function studentIdentity(target) {
  const user = target.user || {};
  const roster = target.roster || {};
  const rosterIds = new Set([
    ...target.rosterRefs.map((ref) => ref.id),
    ...(user.studentRecordId ? [String(user.studentRecordId)] : []),
  ]);
  const studentIds = new Set(
    [user.studentId, roster.studentId]
      .filter((value) => typeof value === "string" && value.trim())
      .map((value) => value.trim()),
  );
  return { rosterIds, studentIds };
}

function matchesStudentRecord(data, target, rosterIds, studentIds) {
  const uidFields = ["uid", "studentUid", "userId", "accountUid"];
  const linkedUids = uidFields
    .map((field) => data[field])
    .filter((value) => typeof value === "string" && value);
  if (linkedUids.some((uid) => uid !== target.uid)) return false;

  const recordId = data.studentRecordId;
  if (recordId != null && !rosterIds.has(String(recordId))) return false;

  const studentId = data.studentId;
  if (studentId != null && !studentIds.has(String(studentId).trim())) return false;

  return (
    linkedUids.includes(target.uid) ||
    (recordId != null && rosterIds.has(String(recordId))) ||
    (studentId != null && studentIds.has(String(studentId).trim()))
  );
}

async function collectStudentRelatedRecords(db, target) {
  const { rosterIds, studentIds } = studentIdentity(target);
  const records = new Map();

  for (const [collectionName, fields] of Object.entries(STUDENT_DATA_COLLECTIONS)) {
    const queries = [];
    for (const field of fields) {
      const values = field === "studentRecordId"
        ? rosterIds
        : field === "studentId"
          ? studentIds
          : target.uid
            ? [target.uid]
            : [];
      for (const value of values) {
        queries.push(
          db.collection(collectionName).where(field, "==", value).get(),
        );
      }
    }

    const snapshots = await Promise.all(queries);
    for (const snapshot of snapshots) {
      for (const document of snapshot.docs) {
        if (matchesStudentRecord(document.data(), target, rosterIds, studentIds)) {
          records.set(document.ref.path, document.ref);
        }
      }
    }
  }
  return [...records.values()];
}

async function deleteStudentRelatedRecords(db, target) {
  const records = await collectStudentRelatedRecords(db, target);
  for (const record of records) {
    await db.recursiveDelete(record);
  }
  return records.length;
}

module.exports = {
  collectStudentRelatedRecords,
  deleteStudentRelatedRecords,
};
