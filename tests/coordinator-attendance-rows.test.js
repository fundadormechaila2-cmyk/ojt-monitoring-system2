import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAttendanceRows } from "../src/pages/coordinator/attendanceRows.js";

const students = [
  { id: "one", uid: "uid-one", name: "First Student", studentId: "001", company: "Company A" },
  { id: "two", uid: "uid-two", name: "Second Student", studentId: "002", company: "Company B" },
  { id: "three", uid: "", name: "Unlinked Student", studentId: "003", company: "Company B" },
];
const records = [
  { id: "record-one", studentUid: "uid-one", studentName: "Old Name", studentId: "001", company: "Company A", date: "2026-01-02", status: "Present" },
  { id: "record-two", studentUid: "uid-two", studentName: "Second Student", studentId: "002", company: "Company B", date: "2026-01-01", status: "Late" },
];
const defaults = { search: "", date: "2026-01-02", status: "All", company: "All companies" };

test("shows each assigned student in the table even without a record on the selected date", () => {
  const rows = buildAttendanceRows(students, records, defaults);
  assert.deepEqual(rows.map((row) => row.name), ["First Student", "Second Student", "Unlinked Student"]);
  assert.deepEqual(rows.map((row) => row.record?.id || null), ["record-one", null, null]);
  assert.equal(rows[1].student.id, "two");
});

test("respects filters without replacing filtered records with empty rows", () => {
  assert.deepEqual(buildAttendanceRows(students, records, { ...defaults, status: "Late" }), []);
  assert.deepEqual(buildAttendanceRows(students, records, { ...defaults, company: "Company B" }).map((row) => row.student.id), ["two", "three"]);
  assert.deepEqual(buildAttendanceRows(students, records, { ...defaults, search: "002" }).map((row) => row.student.id), ["two"]);
});

test("shows all historical records without an extra row for represented students", () => {
  const rows = buildAttendanceRows(students, records, { ...defaults, date: "" });
  assert.deepEqual(rows.map((row) => row.record?.id || null), ["record-one", "record-two", null]);
});

test("uses the current assigned student's company for attendance rows", () => {
  const rows = buildAttendanceRows(students, [{ ...records[0], company: "Previous Company" }], defaults);
  assert.equal(rows[0].company, "Company A");
});
