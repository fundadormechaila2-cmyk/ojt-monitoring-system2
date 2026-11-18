import { AuthContext } from "../context/AuthContextDefinition";
import { useAuth } from "../context/useAuth";
import Settings from "../pages/admin/Settings";
import { auth } from "../services/firebase";
import { DataCard, PageHero } from "./WorkspaceUI";

function OwnAccountSettings() {
  const context = useAuth();
  const uid = auth.currentUser?.uid;

  if (!uid || !context.user) {
    return (
      <main className="settings-page">
        <PageHero
          eyebrow="ACCOUNT WORKSPACE · SETTINGS"
          title="Settings"
          subtitle="Manage your account, preferences, and system settings."
        />
        <DataCard>
          <p role="alert">Your session has expired. Please log in again.</p>
        </DataCard>
      </main>
    );
  }

  return (
    <AuthContext.Provider value={{ ...context, user: { ...context.user, uid } }}>
      <Settings />
    </AuthContext.Provider>
  );
}

export default OwnAccountSettings;
