import { httpsCallable } from "firebase/functions";
import { auth, functions } from "./firebase";

const LOCAL_API_URL = import.meta.env.VITE_ACCOUNT_API_URL || "http://127.0.0.1:5055/manageAccount";
const USE_CLOUD_FUNCTION = import.meta.env.VITE_ACCOUNT_API === "functions";
const manageAccountCall = httpsCallable(functions, "manageAccount");

async function callServer(payload) {
  if (USE_CLOUD_FUNCTION) return (await manageAccountCall(payload)).data;

  const token = await auth.currentUser?.getIdToken(true);
  let response;
  try {
    response = await fetch(LOCAL_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ data: payload }),
    });
  } catch (cause) {
    throw Object.assign(
      new Error("Cannot reach the account management server. Start it with: node functions/localAccountServer.js"),
      { code: "functions/unavailable", cause },
    );
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(body.error?.message || "The operation failed."), { code: `functions/${body.error?.code || "internal"}` });
  }
  return body.data;
}

const errorMessages = {
  "functions/permission-denied": "You do not have permission to perform this action.",
  "functions/unauthenticated": "Your session has expired. Please sign in again.",
  "functions/unavailable": "Network error. Check your connection and try again.",
  "functions/not-found": "This record no longer exists.",
};

async function run(action, target, extra = {}) {
  try {
    return await callServer({ action, ...target, ...extra });
  } catch (error) {
    const message = error.code === "functions/failed-precondition" || error.code === "functions/invalid-argument" || (error.code === "functions/unavailable" && !USE_CLOUD_FUNCTION)
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
export const deleteAccountPermanently = (target) => run("delete", target, { confirm: true });

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
