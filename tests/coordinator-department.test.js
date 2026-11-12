import assert from "node:assert/strict";
import { test } from "node:test";
import { recordDepartmentId } from "../src/constants/departments.js";

test("resolves current and legacy coordinator departments without inventing one", () => {
  assert.equal(recordDepartmentId({ departmentId: "BSIT" }), "BSIT");
  assert.equal(recordDepartmentId({ department: "Bachelor of Science in Business Administration (BSBA)" }), "BSBA");
  assert.equal(recordDepartmentId({ department: "BSBA-FM" }), "BSBA");
  assert.equal(recordDepartmentId({}), "");
});
