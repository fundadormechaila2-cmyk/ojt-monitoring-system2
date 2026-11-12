const assert = require("node:assert/strict");
const { test } = require("node:test");
const { auditCollections } = require("./auditRoleCollections");

const empty = () => ({ users: [], students: [], admins: [], coordinators: [], supervisors: [] });
const item = (id, data) => ({ id, data });

test("accepts existing non-UID roster IDs and correctly linked role profiles", () => {
  const data = empty();
  data.users = [item("c", { role: "coordinator" }), item("s", { role: "student", studentRecordId: "roster" })];
  data.coordinators = [item("c", { uid: "c", role: "coordinator" })];
  data.students = [item("roster", { studentUid: "s" }), item("unlinked", {})];
  assert.deepEqual(auditCollections(data), []);
});

test("reports misplaced roles, duplicates, conflicting links and missing profiles without changes", () => {
  const data = empty();
  data.users = [item("c", { role: "coordinator" }), item("s", { role: "student", studentRecordId: "one" })];
  data.students = [
    item("misplaced", { role: "supervisor", uid: "c" }),
    item("one", { role: "student", studentUid: "s" }),
    item("two", { studentUid: "s" }),
    item("bad", { studentUid: "s", userUid: "c" }),
  ];
  const before = structuredClone(data);
  const issues = auditCollections(data);
  assert.deepEqual(data, before);
  assert.ok(issues.some((issue) => issue.collection === "coordinators" && issue.id === "c"));
  assert.ok(issues.some((issue) => issue.id === "misplaced" && issue.issue.includes("Non-student")));
  assert.ok(issues.some((issue) => issue.id === "two" && issue.issue.includes("also linked")));
  assert.ok(issues.some((issue) => issue.id === "bad" && issue.issue.includes("Conflicting")));
});
