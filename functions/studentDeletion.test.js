const test = require("node:test");
const assert = require("node:assert/strict");
const { collectStudentRelatedRecords, deleteStudentRelatedRecords } = require("./studentDeletion");

function createFakeFirestore(documents) {
  const deleted = [];
  return {
    deleted,
    collection(name) {
      return {
        where(field, operator, value) {
          assert.equal(operator, "==");
          return {
            async get() {
              const matches = (documents[name] || [])
                .filter((document) => document.data[field] === value)
                .map((document) => ({
                  id: document.id,
                  ref: { id: document.id, path: `${name}/${document.id}` },
                  data: () => document.data,
                }));
              return { docs: matches };
            },
          };
        },
      };
    },
    async recursiveDelete(ref) {
      deleted.push(ref.path);
    },
  };
}

test("collects records linked to the selected student by UID or roster ID", async () => {
  const db = createFakeFirestore({
    attendance: [
      { id: "own-by-uid", data: { studentUid: "student-uid", hours: 8 } },
      { id: "own-by-roster", data: { studentRecordId: "roster-1" } },
      { id: "another-student", data: { studentUid: "other-uid", studentId: "S-1" } },
      { id: "conflicting-link", data: { studentUid: "other-uid", studentRecordId: "roster-1" } },
      { id: "conflicting-roster", data: { studentId: "S-1", studentRecordId: "other-roster" } },
    ],
    journals: [
      { id: "own-journal", data: { studentId: "S-1" } },
    ],
  });
  const target = {
    uid: "student-uid",
    roster: { studentId: "S-1" },
    rosterRefs: [{ id: "roster-1" }],
    user: { studentId: "S-1", studentRecordId: "roster-1" },
  };

  const records = await collectStudentRelatedRecords(db, target);

  assert.deepEqual(
    records.map((record) => record.path).sort(),
    ["attendance/own-by-roster", "attendance/own-by-uid", "journals/own-journal"],
  );
});

test("deletes only matching student records recursively", async () => {
  const db = createFakeFirestore({
    studentLoginActivity: [
      { id: "own-login", data: { userId: "student-uid" } },
      { id: "other-login", data: { userId: "other-uid" } },
    ],
  });
  const target = {
    uid: "student-uid",
    roster: {},
    rosterRefs: [],
    user: {},
  };

  const deletedCount = await deleteStudentRelatedRecords(db, target);

  assert.equal(deletedCount, 1);
  assert.deepEqual(db.deleted, ["studentLoginActivity/own-login"]);
});
