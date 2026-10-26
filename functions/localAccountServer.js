// Trusted local server for account lifecycle actions (no Cloud Functions / billing required).
// Run on an administrator's PC with a service-account key that is NOT stored in the repo:
//   $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\secure\service-account.json"
//   node functions/localAccountServer.js
const http = require("node:http");
const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

const usingEmulator = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);
if (!usingEmulator && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error(
    'Missing credentials. Set GOOGLE_APPLICATION_CREDENTIALS to your service-account JSON first, e.g.\n  $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\\secure\\service-account.json"; npm run account-server',
  );
  process.exit(1);
}
initializeApp({
  ...(usingEmulator ? {} : { credential: applicationDefault() }),
  projectId: process.env.GCLOUD_PROJECT || "ojt-monitoringsystem2",
});

const { handleManageAccount } = require("./accountManagement");

const PORT = Number(process.env.PORT || 5055);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ||
  "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,https://ojt-monitoringsystem2.web.app,https://ojt-monitoringsystem2.firebaseapp.com")
  .split(",").map((o) => o.trim());

const isAllowedOrigin = (origin) => ALLOWED_ORIGINS.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || "");

const send = (res, status, body, origin) => {
  const headers = { "Content-Type": "application/json", Vary: "Origin" };
  if (origin && isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type";
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Private-Network"] = "true";
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
};

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (req.method === "OPTIONS") return send(res, 204, {}, origin);
  if (req.method !== "POST" || req.url !== "/manageAccount") return send(res, 404, { error: { code: "not-found", message: "Not found" } }, origin);
  if (origin && !isAllowedOrigin(origin)) {
    return send(res, 403, { error: { code: "permission-denied", message: "Origin not allowed." } }, origin);
  }

  try {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return send(res, 401, { error: { code: "unauthenticated", message: "Sign in as an administrator to manage accounts." } }, origin);
    let decoded;
    try {
      decoded = await getAuth().verifyIdToken(token, true);
    } catch {
      return send(res, 401, { error: { code: "unauthenticated", message: "Your session has expired. Please sign in again." } }, origin);
    }

    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 100000) throw new Error("Request too large");
    }
    const body = raw ? JSON.parse(raw) : {};
    const data = await handleManageAccount({ auth: { uid: decoded.uid, token: decoded }, data: body.data || body });
    return send(res, 200, { data }, origin);
  } catch (error) {
    const code = typeof error.code === "string" && !error.code.includes("/") ? error.code : "internal";
    const known = ["permission-denied", "unauthenticated", "failed-precondition", "invalid-argument", "not-found"].includes(code);
    if (!known) console.error(error);
    return send(res, known ? 400 : 500, { error: { code: known ? code : "internal", message: known ? error.message : "The operation did not finish. Please retry." } }, origin);
  }
});

server.listen(PORT, "127.0.0.1", () => console.log(`Account management server listening on http://127.0.0.1:${PORT}`));
