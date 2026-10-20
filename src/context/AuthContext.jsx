import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../services/firebase";
import { getUserData } from "../services/userService";
import { isAccountLive } from "../services/recordState";
import { AuthContext } from "./AuthContextDefinition";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      try {
        if (!currentUser) {
          setUser(null);
          return;
        }

        const userData = await getUserData(currentUser.uid);

        if (userData && !isAccountLive(userData)) {
          setUser(null);
          await signOut(auth);
          return;
        }

        setUser({
          uid: currentUser.uid,
          email: currentUser.email,
          ...(userData || {}),
        });
      } catch (error) {
        console.error("Unable to load the authenticated user profile:", error);
        setUser(null);
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
    return onSnapshot(doc(db, "users", signedInUid), (snapshot) => {
      if (snapshot.exists() && !isAccountLive(snapshot.data())) {
        setUser(null);
        signOut(auth).catch((error) => console.error("Unable to sign out a deactivated account:", error));
      }
    }, () => {});
  }, [signedInUid]);

  return (
    <AuthContext.Provider value={{ user }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

