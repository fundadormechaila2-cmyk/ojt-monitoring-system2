import { httpsCallable } from "firebase/functions";
import { auth, functions } from "./firebase";

const LOCAL_API_URL =
  import.meta.env.VITE_ACCOUNT_API_URL || "http://127.0.0.1:5055/manageAccount";
const USE_LOCAL_API = import.meta.env.VITE_ACCOUNT_API === "local";
const manageAccountCall = httpsCallable(functions, "manageAccount");

async function callLocalServer(payload) {
  const token = await auth.currentUser?.getIdToken();
  let response;
  try {
    response = await fetch(LOCAL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ data: payload }),
    });
  } catch (cause) {
    throw Object.assign(
      new Error(
        "Cannot reach the local account management server. Start it with `npm run account-server` after configuring GOOGLE_APPLICATION_CREDENTIALS, or deploy the manageAccount Cloud Function.",
      ),
      { code: "functions/unavailable", cause },
    );
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(
      new Error(body.error?.message || "The operation failed."),
      { code: `functions/${body.error?.code || "internal"}` },
    );
  }

  return body.data;
}

function shouldUseLocalFallback(error) {
  if (!error || typeof error !== "object") return false;
  return ["functions/not-found", "functions/unavailable", "functions/internal"].includes(error.code);
}

async function callServer(payload) {
  if (USE_LOCAL_API) return callLocalServer(payload);

  try {
    return (await manageAccountCall(payload)).data;
  } catch (error) {
    if (!shouldUseLocalFallback(error)) throw error;

    try {
      return await callLocalServer(payload);
    } catch (fallbackError) {
      const message =
        "Account management is unavailable. Deploy the manageAccount function or run `npm run account-server` after configuring GOOGLE_APPLICATION_CREDENTIALS.";
      throw Object.assign(new Error(message), {
        code: "functions/unavailable",
        cause: { primary: error, fallback: fallbackError },
      });
    }
  }
}

const errorMessages = {
  "functions/permission-denied":
    "You do not have permission to perform this action.",
  "functions/unauthenticated":
    "Your session has expired. Please sign in again.",
  "functions/unavailable":
    "Network error. Check your connection and try again.",
  "functions/not-found": "This record no longer exists.",
  "functions/internal":
    "Account management is unavailable. The Firebase project owner must enable the Cloud Build API and deploy the manageAccount function.",
};

async function run(action, target, extra = {}) {
  try {
    return await callServer({ action, ...target, ...extra });
  } catch (error) {
    const displayOriginalMessage =
      error.code === "functions/failed-precondition" ||
      error.code === "functions/invalid-argument" ||
      error.code === "functions/not-found" ||
      error.code === "functions/unavailable";

    const message = displayOriginalMessage
      ? error.message
      : errorMessages[error.code] || error.message || "The operation failed.";
    throw new Error(message, { cause: error });
  }
}

// target: { targetType: "user" | "student", targetId }
export const previewAccount = (target) => run("preview", target);
export const deactivateAccount = (target) => run("deactivate", target);
export const reactivateAccount = (target) => run("reactivate", target);
export const archiveAccount = (target) => run("archive", target);
export const restoreAccount = (target) => run("restore", target);
export const deleteAccountPermanently = (target) =>
  run("delete", target, { confirm: true });

export async function isAccountManagementAvailable() {
  if (!auth.currentUser?.uid) return false;
  try {
    await previewAccount({ targetType: "user", targetId: auth.currentUser.uid });
    return true;
  } catch (error) {
    const code = error?.code || "";
    return !["functions/unavailable", "functions/internal", "functions/not-found"].includes(code);
  }
}

export function describeRelatedRecords(related) {
  const labels = {
    attendance: "attendance records",
    evaluations: "evaluations",
    applications: "applications",
    loginActivity: "login activity entries",
    assignedStudents: "assigned students",
    createdSupervisors: "supervisor accounts created",
  };
  return Object.entries(related?.counts || {})
    .filter(([key, value]) => labels[key] && value > 0)
    .map(([key, value]) => `${value} ${labels[key]}`);
}
