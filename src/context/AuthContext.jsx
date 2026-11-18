import { useCallback, useEffect, useRef, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../services/firebase";
import { hasAcceptedTerms, TERMS_VERSION } from "../services/termsAcceptanceService";
import { getUserData } from "../services/userService";
import { isAccountLive } from "../services/recordState";
import { AuthContext } from "./AuthContextDefinition";
import { logLoginDiagnostic } from "../services/temporaryLoginDiagnostics";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [termsAcceptedUid, setTermsAcceptedUid] = useState(null);
  const [termsCheckedUid, setTermsCheckedUid] = useState(null);
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(true);
  const termsCheckGeneration = useRef(0);

  const markTermsAccepted = useCallback((uid) => {
    if (!uid || auth.currentUser?.uid !== uid) {
      throw new Error("The signed-in user does not match the Terms acceptance.");
    }

    termsCheckGeneration.current += 1;
    setTermsAcceptedUid(uid);
    setTermsCheckedUid(uid);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      const checkGeneration = ++termsCheckGeneration.current;
      try {
        if (!currentUser) {
          setUser(null);
          setTermsAcceptedUid(null);
          setTermsCheckedUid(null);
          return;
        }

        setAuthError("");
        setTermsAcceptedUid(null);
        setTermsCheckedUid(null);
        const userData = await getUserData(currentUser.uid, "AuthProvider.onAuthStateChanged");
        if (auth.currentUser?.uid !== currentUser.uid) return;

        if (userData && !isAccountLive(userData)) {
          setUser(null);
          setTermsAcceptedUid(null);
          setTermsCheckedUid(null);
          await signOut(auth);
          return;
        }

        setUser({
          uid: currentUser.uid,
          email: currentUser.email,
          ...(userData || {}),
        });

        const accepted = await hasAcceptedTerms(currentUser.uid, TERMS_VERSION);
        if (termsCheckGeneration.current === checkGeneration) {
          setTermsAcceptedUid(accepted ? currentUser.uid : null);
          setTermsCheckedUid(currentUser.uid);
        }
      } catch (error) {
        console.error("Unable to load the authenticated user or verify Terms acceptance:", error);
        if (termsCheckGeneration.current === checkGeneration) {
          setUser(null);
          setTermsAcceptedUid(null);
          setTermsCheckedUid(null);
          setAuthError("Unable to verify your account or Terms acceptance. Please sign in again.");
          if (auth.currentUser?.uid === currentUser?.uid) {
            try {
              await signOut(auth);
            } catch (signOutError) {
              console.error("Unable to sign out after an authentication error:", signOutError);
            }
          }
        }
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const signedInUid = user?.uid;
  useEffect(() => {
    if (!signedInUid) return undefined;
    // Sign out immediately if an administrator deactivates or archives this account mid-session.
    const ref = doc(db, "users", signedInUid);
    const request = { source: "AuthProvider account listener", path: ref.path, requestedUid: signedInUid };
    logLoginDiagnostic({ ...request, stage: "listen-start" });
    return onSnapshot(ref, (snapshot) => {
      if (snapshot.exists() && !isAccountLive(snapshot.data())) {
        setUser(null);
        setTermsAcceptedUid(null);
        setTermsCheckedUid(null);
        signOut(auth).catch((error) => console.error("Unable to sign out a deactivated account:", error));
      } else if (snapshot.exists()) {
        setUser((current) => current?.uid === signedInUid
          ? { ...current, ...snapshot.data(), uid: signedInUid }
          : current);
      }
    }, (error) => logLoginDiagnostic({ ...request, stage: "listen-error", error }));
  }, [signedInUid]);

  return (
    <AuthContext.Provider value={{
      user,
      termsAccepted: Boolean(user && termsAcceptedUid === user.uid),
      termsStatusReady: Boolean(user && termsCheckedUid === user.uid),
      markTermsAccepted,
      authError,
    }}>
      {loading ? (
        <main className="auth-loading-screen" role="status" aria-live="polite">
          <span className="auth-loading-spinner" aria-hidden="true" />
          <p>Loading your workspace…</p>
        </main>
      ) : children}
    </AuthContext.Provider>
  );
}
