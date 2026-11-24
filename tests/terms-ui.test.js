import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

let server;
let TermsModal;
let Login;
let RoleRoute;
let AuthContext;
let MemoryRouter;

before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  ({ default: TermsModal } = await server.ssrLoadModule("/src/components/TermsModal.jsx"));
  ({ default: Login } = await server.ssrLoadModule("/src/pages/login.jsx"));
  ({ default: RoleRoute } = await server.ssrLoadModule("/src/services/RoleRoute.jsx"));
  ({ AuthContext } = await server.ssrLoadModule("/src/context/AuthContextDefinition.jsx"));
  ({ MemoryRouter } = await import("react-router-dom"));
});

after(async () => {
  await server?.close();
});

test("login shows an unchecked agreement and an enabled Continue button", () => {
  const previousSessionStorage = globalThis.sessionStorage;
  globalThis.sessionStorage = { getItem: () => null, removeItem() {} };
  let markup;
  try {
    markup = renderToStaticMarkup(
      React.createElement(MemoryRouter, null,
        React.createElement(AuthContext.Provider, {
          value: {
            user: null,
            termsAccepted: false,
            termsStatusReady: false,
            markTermsAccepted() {},
            authError: "",
          },
        }, React.createElement(Login)),
      ),
    );
  } finally {
    if (previousSessionStorage === undefined) {
      delete globalThis.sessionStorage;
    } else {
      globalThis.sessionStorage = previousSessionStorage;
    }
  }
  assert.match(markup, /id="login-terms-accepted" type="checkbox"/);
  assert.doesNotMatch(markup, /id="login-terms-accepted" type="checkbox"[^>]*checked/);
  assert.match(markup, /<button class="login-submit" type="submit">Continue<\/button>/);
  assert.match(markup, /I agree to the/);
  assert.match(markup, /class="login-terms-link" type="button">Terms and Conditions<\/button>/);
  assert.doesNotMatch(markup, /I Agree and Continue|>I Agree</);
});

test("Terms dialog displays all supplied sections without an agreement action", () => {
  const markup = renderToStaticMarkup(React.createElement(TermsModal, { onClose() {} }));
  assert.match(markup, /Last Updated: November 18, 2026/);
  for (const section of [
    "Acceptance of Terms", "User Accounts and Security", "Role-Based Access",
    "QR Code Attendance Monitoring", "Provide accurate real time progress of interns.",
    "Manual Attendance Recording", "Internet Connection and System Access",
    "Data Privacy and Confidentiality", "Prohibited Activities",
    "System Maintenance and Availability", "Violations and Responsibilities",
    "Changes to Terms and Conditions", "Agreement",
  ]) {
    assert.ok(markup.includes(section), section);
  }
  assert.ok(!markup.includes("Attendance Accuracy and Honesty"));
  assert.match(markup, /<button class="link-button" type="button">Close<\/button>/);
  assert.doesNotMatch(markup, /I Agree and Continue|>I Agree</);
});

test("all four role routes block missing or unchecked acceptance", () => {
  for (const role of ["admin", "coordinator", "supervisor", "student"]) {
    const render = (termsAccepted, termsStatusReady) => renderToStaticMarkup(
      React.createElement(MemoryRouter, null,
        React.createElement(AuthContext.Provider, {
          value: { user: { uid: role, role }, termsAccepted, termsStatusReady },
        }, React.createElement(RoleRoute, { allowedRole: role }, React.createElement("p", null, "Dashboard"))),
      ),
    );
    assert.doesNotMatch(render(false, true), /Dashboard/, role);
    assert.doesNotMatch(render(false, false), /Dashboard/, role);
    assert.match(render(true, true), /Dashboard/, role);
  }
});
