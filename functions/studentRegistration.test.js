const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildNotification,
  generateTemporaryPassword,
} = require("./studentRegistration");

test("temporary passwords meet the generated complexity and length requirements", () => {
  const password = generateTemporaryPassword();
  assert.equal(password.length, 20);
  assert.match(password, /[A-Z]/);
  assert.match(password, /[a-z]/);
  assert.match(password, /[2-9]/);
  assert.match(password, /[!@#$%&*]/);
});

test("account email is branded and escapes untrusted HTML values", () => {
  const notification = buildNotification({
    email: "student@example.test",
    fullName: "<Student & Name>",
    password: "Ab2!secure",
  });

  assert.match(notification.subject, /LCC I OJT Monitoring System/);
  assert.match(notification.html, /Welcome, &lt;Student &amp; Name&gt;!/);
  assert.match(notification.html, /student@example\.test/);
  assert.match(notification.html, /Ab2!secure/);
  assert.match(notification.html, /Login Now/);
  assert.match(notification.text, /change this password/);
  assert.doesNotMatch(notification.html, /<Student/);
});
