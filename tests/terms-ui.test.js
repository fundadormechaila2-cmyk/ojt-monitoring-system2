import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

let server;
let TermsModal;
let RoleRoute;
let AuthContext;
let MemoryRouter;

before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  ({ default: TermsModal } = await server.ssrLoadModule("/src/components/TermsModal.jsx"));
  ({ default: RoleRoute } = await server.ssrLoadModule("/src/services/RoleRoute.jsx"));
  ({ AuthContext } = await server.ssrLoadModule("/src/context/AuthContextDefinition.jsx"));
  ({ MemoryRouter } = await import("react-router-dom"));
});

after(async () => {
  await server?.close();
});

test("Terms dialog requires agreement and shows all supplied sections", () => {
  const render = (checked, loading = false) => renderToStaticMarkup(React.createElement(TermsModal, {
    checked,
    loading,
    onCheckedChange() {},
    onAccept() {},
    onSignOut() {},
    error: "",
  }));
  const unchecked = render(false);
  assert.match(unchecked, /disabled="">I Agree and Continue<\/button>/);
  assert.match(unchecked, /Last Updated: November 18, 2026/);
  for (const section of [
    "Acceptance of Terms", "User Accounts and Security", "Role-Based Access",
    "QR Code Attendance Monitoring", "Attendance Accuracy and Honesty",
    "Manual Attendance Recording", "Internet Connection and System Access",
    "Data Privacy and Confidentiality", "Prohibited Activities",
    "System Maintenance and Availability", "Violations and Responsibilities",
    "Changes to Terms and Conditions", "Agreement",
  ]) {
    assert.ok(unchecked.includes(section), section);
  }
  assert.match(render(true), /<button class="login-submit" type="submit">I Agree and Continue<\/button>/);
  assert.match(render(true, true), /disabled="">.*Saving agreement/);
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
