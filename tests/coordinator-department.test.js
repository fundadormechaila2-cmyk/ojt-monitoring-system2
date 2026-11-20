import assert from "node:assert/strict";
import { test } from "node:test";
import {
  recordDepartmentId,
  sameDepartment,
} from "../src/constants/departments.js";

test("resolves current and legacy coordinator departments without inventing one", () => {
  assert.equal(recordDepartmentId({ departmentId: "BSIT" }), "BSIT");
  assert.equal(recordDepartmentId({ department: "Bachelor of Science in Business Administration (BSBA)" }), "BSBA");
  assert.equal(recordDepartmentId({ department: "BSBA-FM" }), "BSBA");
  assert.equal(recordDepartmentId({}), "");
});

test("compares departments from coordinator and supervisor records", () => {
  const coordinator = { role: "coordinator", departmentId: "BSHM" };
  const supervisor = {
    role: "supervisor",
    department: "Bachelor of Science in Hospitality Management",
  };

  assert.equal(sameDepartment(supervisor, coordinator), true);
  assert.equal(
    sameDepartment(supervisor, { role: "coordinator", departmentId: "BSIT" }),
    false,
  );
  assert.equal(sameDepartment(supervisor, { role: "coordinator" }), false);
});
