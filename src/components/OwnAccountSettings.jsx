import { AuthContext } from "../context/AuthContextDefinition";
import { useAuth } from "../context/useAuth";
import Settings from "../pages/admin/Settings";
import { auth } from "../services/firebase";

function OwnAccountSettings() {
  const context = useAuth();
  const uid = auth.currentUser?.uid;

  if (!uid || !context.user) {
    return <p role="alert">Your session has expired. Please log in again.</p>;
  }

  return (
    <AuthContext.Provider value={{ ...context, user: { ...context.user, uid } }}>
      <Settings />
    </AuthContext.Provider>
  );
}

export default OwnAccountSettings;
