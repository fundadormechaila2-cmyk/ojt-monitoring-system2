import { useEffect, useState } from "react";
import { EmailAuthProvider, reauthenticateWithCredential, signOut, updatePassword } from "firebase/auth";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import {
  Check,
  ChevronRight,
  KeyRound,
  LogOut,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { auth, db } from "../../services/firebase";
import { useAuth } from "../../context/useAuth";
import "../../styles/settings.css";

const defaultProfile = {
  firstName: "",
  lastName: "",
  contactNumber: "",
};

function Settings() {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState("profile");
  const [profile, setProfile] = useState(defaultProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [showPasswords, setShowPasswords] = useState(false);

  const firebaseUser = auth.currentUser;
  const email = firebaseUser?.email || user?.email || "";
  const role = user?.role || "student";
  const fullName = `${profile.firstName} ${profile.lastName}`.trim() || email || "Account";
  const initials = fullName.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();

  useEffect(() => {
    let mounted = true;
    const loadSettings = async () => {
      if (!user?.uid) {
        setLoading(false);
        return;
      }
      try {
        const snapshot = await getDoc(doc(db, "users", user.uid));
        if (mounted && snapshot.exists()) {
          const data = snapshot.data();
          setProfile({
            firstName: data.firstName || "",
            lastName: data.lastName || "",
            contactNumber: data.contactNumber || data.contact || "",
          });
        }
      } catch (loadError) {
        console.error("Unable to load settings:", loadError);
        if (mounted) setError("Unable to load settings.");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    loadSettings();
    return () => { mounted = false; };
  }, [user?.uid]);

  const showNotice = (message) => {
    setError("");
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3000);
  };

  const updateField = (field, value) => setProfile((current) => ({ ...current, [field]: value }));
  const updatePasswordField = (field, value) => setPasswords((current) => ({ ...current, [field]: value }));
  const roleLabel = role === "admin"
    ? "Administrator"
    : role === "coordinator"
      ? "OJT Coordinator"
      : role === "supervisor"
        ? "Supervisor"
        : "Student";

  const saveChanges = async (event) => {
    event.preventDefault();
    if (!user?.uid) {
      setError("Your session has expired. Please log in again.");
      return;
    }
    if (!profile.firstName.trim() || !profile.lastName.trim()) {
      setError("First name and last name are required.");
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, "users", user.uid), {
        firstName: profile.firstName.trim(),
        lastName: profile.lastName.trim(),
        contactNumber: profile.contactNumber.trim(),
        updatedAt: serverTimestamp(),
      });
      showNotice("Settings saved successfully.");
    } catch (saveError) {
      console.error("Unable to save settings:", saveError);
      setError("Unable to save settings.");
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = () => {
    setProfile({
      firstName: user?.firstName || "",
      lastName: user?.lastName || "",
      contactNumber: user?.contactNumber || "",
    });
    showNotice("Settings reset to default values. Save changes to apply them.");
  };

  const changePassword = async (event) => {
    event.preventDefault();
    setError("");
    if (!firebaseUser || !email) {
      setError("Your session has expired. Please log in again.");
      return;
    }
    if (passwords.next.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (passwords.next !== passwords.confirm) {
      setError("New passwords do not match.");
      return;
    }
    try {
      await reauthenticateWithCredential(firebaseUser, EmailAuthProvider.credential(email, passwords.current));
      await updatePassword(firebaseUser, passwords.next);
      setPasswords({ current: "", next: "", confirm: "" });
      showNotice("Password changed successfully.");
    } catch (passwordError) {
      console.error("Unable to change password:", passwordError);
      setError(passwordError.code === "auth/wrong-password" || passwordError.code === "auth/invalid-credential"
        ? "Current password is incorrect."
        : passwordError.code === "auth/requires-recent-login"
          ? "Please log in again before changing your password."
          : "Unable to change password.");
    }
  };

  const navItems = [
    { id: "profile", label: "Profile settings", icon: UserRound },
    { id: "account", label: "Account settings", icon: KeyRound },
  ];

  if (loading) return <main className="settings-page"><div className="settings-empty-state">Loading settings...</div></main>;

  return (
    <main className="settings-page">
      <header className="settings-header">
        <div><p className="settings-eyebrow">LCCI · OJT MONITORING SYSTEM</p><h1>Settings</h1><p>Manage your account, preferences, and system settings.</p></div>
        <div className="settings-save-state"><span className="settings-online-dot" /> Settings are synced to your account</div>
      </header>
      {notice && <div className="settings-alert success" role="status"><Check size={15} /> {notice}</div>}
      {error && <div className="settings-alert error" role="alert">{error}</div>}
      <div className="settings-layout">
        <aside className="settings-nav" aria-label="Settings sections">
          <p className="settings-nav-label">Settings menu</p>
          {navItems.map(({ id, label, icon: Icon }) => <button type="button" key={id} className={activeSection === id ? "active" : ""} onClick={() => setActiveSection(id)}><Icon size={17} /><span>{label}</span>{activeSection === id && <ChevronRight size={15} />}</button>)}
        </aside>
        <div className="settings-content">
          {activeSection === "profile" && <section className="settings-card"><SettingsHeading icon={UserRound} eyebrow="Personal details" title="Profile" description="Update the information associated with your OJT Monitoring System account." /><form onSubmit={saveChanges}><div className="profile-identity"><div className="profile-avatar">{initials}</div><div><h3>{fullName}</h3><p>{roleLabel}</p></div></div><div className="settings-form-grid"><TextField label="First Name" value={profile.firstName} onChange={(value) => updateField("firstName", value)} /><TextField label="Last Name" value={profile.lastName} onChange={(value) => updateField("lastName", value)} /><ReadOnlyField label="Email" value={email || "—"} /><TextField label="Contact Number" value={profile.contactNumber} onChange={(value) => updateField("contactNumber", value)} /></div><SettingsActions saving={saving} onReset={resetDefaults} /></form></section>}

          {activeSection === "account" && (
            <section className="settings-card">
              <SettingsHeading
                icon={ShieldCheck}
                eyebrow="Account access and protection"
                title="Account settings"
                description="Manage your password, sign out, and review your account security details."
              />
              <form className="settings-subsection" onSubmit={changePassword}>
                <h3>Change Password</h3>
                <p>Use your current password to set a new secure password.</p>
                <div className="settings-password-grid">
                  <PasswordField
                    label="Current password"
                    value={passwords.current}
                    onChange={(value) => updatePasswordField("current", value)}
                    visible={showPasswords}
                  />
                  <PasswordField
                    label="New password"
                    value={passwords.next}
                    onChange={(value) => updatePasswordField("next", value)}
                    visible={showPasswords}
                  />
                  <PasswordField
                    label="Confirm new password"
                    value={passwords.confirm}
                    onChange={(value) => updatePasswordField("confirm", value)}
                    visible={showPasswords}
                  />
                </div>
                <label className="settings-check">
                  <input
                    type="checkbox"
                    checked={showPasswords}
                    onChange={(event) => setShowPasswords(event.target.checked)}
                  />{" "}
                  Show password characters
                </label>
                <button type="submit" className="settings-primary-button">
                  Change Password
                </button>
              </form>
              <div className="security-grid">
                <div className="security-detail">
                  <span>Email</span>
                  <strong>{email || "—"}</strong>
                  <small>Firebase Authentication account</small>
                </div>
                <div className="security-detail">
                  <span>Account Role</span>
                  <strong>{roleLabel}</strong>
                  <small>Role changes are managed by administrators.</small>
                </div>
                <div className="security-detail">
                  <span>Account Status</span>
                  <strong>Active</strong>
                  <small>Your account is currently enabled.</small>
                </div>
              </div>
              <div className="settings-option-row">
                <div className="settings-option-icon red">
                  <LogOut size={17} />
                </div>
                <div>
                  <strong>Logout</strong>
                  <span>Sign out of your current account.</span>
                </div>
                <button
                  type="button"
                  className="settings-danger-button"
                  onClick={() => signOut(auth)}
                >
                  Logout
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}

function SettingsHeading({ icon: Icon, eyebrow, title, description }) { return <div className="settings-card-heading"><span className="settings-heading-icon"><Icon size={18} /></span><div><p>{eyebrow}</p><h2>{title}</h2><span>{description}</span></div></div>; }
function TextField({ label, value, onChange }) { return <label className="settings-field"><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
function ReadOnlyField({ label, value }) { return <label className="settings-field"><span>{label}</span><input value={value} readOnly /></label>; }
function PasswordField({ label, value, onChange, visible }) { return <label className="settings-field"><span>{label}</span><input type={visible ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} autoComplete="current-password" /></label>; }
function SettingsActions({ saving, onReset }) { return <div className="settings-card-actions"><button type="button" className="settings-outline-button" onClick={onReset}>Reset to Default</button><button type="submit" className="settings-primary-button" disabled={saving}><Save size={14} /> {saving ? "Saving..." : "Save Changes"}</button></div>; }

export default Settings;
