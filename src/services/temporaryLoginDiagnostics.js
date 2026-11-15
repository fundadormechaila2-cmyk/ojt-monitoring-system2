import { auth, db, firebaseConfig } from "./firebase";

// Temporary login diagnostics: remove this module and its call sites after troubleshooting.
export function logLoginDiagnostic({ stage, source, path = null, requestedUid = null, error = null }) {
  if (!import.meta.env.DEV) return;

  console.info("[temporary-login-diagnostic]", {
    stage,
    source,
    path,
    hasCurrentUser: Boolean(auth.currentUser),
    authenticatedUid: auth.currentUser?.uid || null,
    requestedUid,
    firebaseErrorCode: error?.code || null,
    firestoreProjectId: db.app.options.projectId,
    authProjectId: auth.app.options.projectId,
    configuredProjectId: firebaseConfig.projectId,
    projectOverrideSet: Boolean(import.meta.env.VITE_FIREBASE_PROJECT_ID),
  });
}
