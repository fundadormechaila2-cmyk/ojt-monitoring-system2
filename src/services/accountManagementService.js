import { httpsCallable } from "firebase/functions";
import { signOut } from "firebase/auth";
import { auth, firebaseConfig, functions } from "./firebase";

const LOCAL_API_URL =
  import.meta.env.VITE_ACCOUNT_API_URL || "http://127.0.0.1:5055/manageAccount";
const CLOUD_API_URL =
  import.meta.env.VITE_ACCOUNT_CLOUD_URL ||
  `https://us-central1-${firebaseConfig.projectId}.cloudfunctions.net/manageAccountApi`;
const USE_LOCAL_API = import.meta.env.VITE_ACCOUNT_API === "local";
const manageAccountCall = httpsCallable(functions, "manageAccount");

function isInvalidSessionError(error) {
  return [
    "auth/id-token-expired",
    "auth/id-token-revoked",
    "auth/invalid-id-token",
    "auth/invalid-user-token",
    "auth/user-disabled",
    "auth/user-not-found",
    "auth/user-token-expired",
  ].includes(error?.code);
}

function canRetryWithRefreshedToken(error) {
  return [
    "functions/token-expired",
    "functions/unauthenticated",
  ].includes(error?.code);
}

async function endSession(message) {
  sessionStorage.setItem("account-session-message", message);
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Unable to sign out after the account API rejected the session:", error);
  }
  throw Object.assign(new Error(message), { code: "functions/unauthenticated" });
}

function accountServiceRejectedToken() {
  return Object.assign(
    new Error(
      "The account service rejected the refreshed Firebase token. Your login is still active; retry or contact an administrator if this continues.",
    ),
    { code: "functions/unauthenticated" },
  );
}

async function getCurrentUser() {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    await endSession("Your session has ended. Please sign in again.");
  }
  return currentUser;
}

async function postToApi(url, payload, token) {
  let response;
  try {
    response = await fetch(url, {
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
        "Cannot reach the account management API. Check the backend deployment and your network connection.",
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

function postToLocalServer(payload, token) {
  return postToApi(LOCAL_API_URL, payload, token);
}

async function callLocalServer(payload) {
  const currentUser = await getCurrentUser();
  let token;
  try {
    token = await currentUser.getIdToken();
  } catch (error) {
    if (isInvalidSessionError(error)) {
      await endSession("Your session is no longer valid. Please sign in again.");
    }
    throw error;
  }

  try {
    return await postToLocalServer(payload, token);
  } catch (error) {
    if (!canRetryWithRefreshedToken(error)) throw error;
  }

  try {
    const refreshedToken = await currentUser.getIdToken(true);
    return await postToLocalServer(payload, refreshedToken);
  } catch (error) {
    if (isInvalidSessionError(error)) {
      await endSession("Your session expired and could not be refreshed. Please sign in again.");
    }
    if (canRetryWithRefreshedToken(error)) throw accountServiceRejectedToken();
    throw error;
  }
}

async function callLegacyCloudFunction(payload) {
  try {
    return (await manageAccountCall(payload)).data;
  } catch (error) {
    if (error?.code !== "functions/unauthenticated") throw error;
  }

  const currentUser = await getCurrentUser();
  try {
    await currentUser.getIdToken(true);
  } catch (error) {
    if (isInvalidSessionError(error)) {
      await endSession("Your session expired and could not be refreshed. Please sign in again.");
    }
    throw error;
  }

  try {
    return (await manageAccountCall(payload)).data;
  } catch (error) {
    if (error?.code === "functions/unauthenticated") throw accountServiceRejectedToken();
    throw error;
  }
}

async function callCloudFunction(payload) {
  const currentUser = await getCurrentUser();
  let token;
  try {
    token = await currentUser.getIdToken();
  } catch (error) {
    if (isInvalidSessionError(error)) {
      await endSession("Your session is no longer valid. Please sign in again.");
    }
    throw error;
  }

  try {
    return await postToApi(CLOUD_API_URL, payload, token);
  } catch (error) {
    if (error.code === "functions/token-expired" || error.code === "functions/unauthenticated") {
      try {
        token = await currentUser.getIdToken(true);
      } catch (refreshError) {
        if (isInvalidSessionError(refreshError)) {
          await endSession("Your session expired and could not be refreshed. Please sign in again.");
        }
        throw refreshError;
      }

      try {
        return await postToApi(CLOUD_API_URL, payload, token);
      } catch (retryError) {
        if (
          retryError.code === "functions/token-expired" ||
          retryError.code === "functions/unauthenticated"
        ) {
          throw accountServiceRejectedToken();
        }
        throw retryError;
      }
    }

    if (error.code === "functions/not-found") {
      return callLegacyCloudFunction(payload);
    }
    throw error;
  }
}

function shouldUseLocalFallback(error) {
  if (!error || typeof error !== "object") return false;
  return ["functions/not-found", "functions/unavailable", "functions/internal"].includes(error.code);
}

async function callServer(payload) {
  if (USE_LOCAL_API) return callLocalServer(payload);

  try {
    return await callCloudFunction(payload);
  } catch (error) {
    if (!shouldUseLocalFallback(error)) throw error;

    try {
      return await callLocalServer(payload);
    } catch (fallbackError) {
      throw Object.assign(new Error(
        fallbackError?.message ||
          "Account management is unavailable. Deploy the manageAccount function or start the local account server.",
      ), {
        code: fallbackError?.code || "functions/unavailable",
        cause: { primary: error, fallback: fallbackError },
      });
    }
  }
}

const errorMessages = {
  "functions/permission-denied":
    "You do not have permission to perform this action.",
  "functions/unauthenticated":
    "The account service rejected the refreshed Firebase token. Your login is still active; retry or contact an administrator if this continues.",
  "functions/unavailable":
    "Network error. Check your connection and try again.",
  "functions/not-found": "This record no longer exists.",
  "functions/internal":
    "The account operation failed on the server. Please retry; if the problem continues, check the account-server or Cloud Functions logs.",
};

async function run(action, target, extra = {}) {
  try {
    return await callServer({ action, ...target, ...extra });
  } catch (error) {
    const displayOriginalMessage =
      error.code === "functions/failed-precondition" ||
      error.code === "functions/invalid-argument" ||
      error.code === "functions/not-found" ||
      error.code === "functions/unavailable" ||
      error.code === "functions/unauthenticated";

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
