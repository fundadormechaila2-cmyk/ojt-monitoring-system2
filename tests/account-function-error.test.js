import assert from "node:assert/strict";
import { test } from "node:test";
import { accountFunctionError } from "../src/services/accountFunctionError.js";

test("generic callable failures give actionable advice without claiming creation failed", () => {
  const original = Object.assign(new Error("internal"), { code: "functions/internal" });
  const result = accountFunctionError(original);
  assert.match(result.message, /functions are deployed/i);
  assert.match(result.message, /check whether the account was already created/i);
  assert.equal(result.code, original.code);
  assert.equal(result.cause, original);
});

test("specific server errors remain visible", () => {
  const original = Object.assign(new Error("This email address is already registered."), {
    code: "functions/already-exists",
  });
  assert.equal(accountFunctionError(original), original);
  const serverError = Object.assign(new Error("The student login could not be created."), {
    code: "functions/internal",
  });
  assert.equal(accountFunctionError(serverError), serverError);
});
