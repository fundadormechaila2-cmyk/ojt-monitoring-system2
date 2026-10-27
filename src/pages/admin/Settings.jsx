import { useEffect, useState } from "react";
import { EmailAuthProvider, reauthenticateWithCredential, signOut, updatePassword } from "firebase/auth";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import {
  Bell,
  Check,
  ChevronRight,
  KeyRound,
  LogOut,
  Monitor,
  Palette,
  Save,
  ShieldCheck,
  Smartphone,
  UserRound,
  X,
} from "lucide-react";
import { auth, db } from "../../services/firebase";
import { useAuth } from "../../context/useAuth";
import "../../styles/settings.css";

const defaultNotifications = {
  application: true,
  attendance: true,
  reports: false,
  evaluation: true,
};

const defaultProfile = {
  firstName: "",
  lastName: "",
  contactNumber: "",
  department: "",
};

function Settings() {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState("profile");
  const [profile, setProfile] = useState(defaultProfile);
  const [notifications, setNotifications] = useState(defaultNotifications);
  const [theme, setTheme] = useState(() => localStorage.getItem("ojt-theme") || "Light");
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
            department: data.department || data.course || "",
          });
          setNotifications({ ...defaultNotifications, ...(data.settings?.notifications || data.notifications || {}) });
          if (data.settings?.theme || data.theme) setTheme(data.settings?.theme || data.theme);
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

  useEffect(() => {
    document.documentElement.dataset.theme = theme.toLowerCase();
    localStorage.setItem("ojt-theme", theme);
  }, [theme]);

  const showNotice = (message) => {
    setError("");
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3000);
  };

  const updateField = (field, value) => setProfile((current) => ({ ...current, [field]: value }));
  const updatePasswordField = (field, value) => setPasswords((current) => ({ ...current, [field]: value }));
  const roleLabel = role === "admin" ? "Administrator" : role === "coordinator" ? "OJT Coordinator" : "Student";

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
        department: profile.department.trim(),
        settings: { theme, notifications },
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
      department: user?.department || "",
    });
    setNotifications(defaultNotifications);
    setTheme("Light");
    showNotice("Settings reset to default values. Save changes to apply them.");
  };

  const cancelChanges = () => {
    setProfile({ firstName: user?.firstName || "", lastName: user?.lastName || "", contactNumber: user?.contactNumber || "", department: user?.department || "" });
    setError("");
    showNotice("Unsaved changes were cancelled.");
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
    { id: "appearance", label: "Appearance", icon: Palette },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "security", label: "Security", icon: ShieldCheck },
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
          {activeSection === "profile" && <section className="settings-card"><SettingsHeading icon={UserRound} eyebrow="Personal details" title="Profile" description="Update the information associated with your OJT Monitoring System account." /><form onSubmit={saveChanges}><div className="profile-identity"><div className="profile-avatar">{initials}</div><div><h3>{fullName}</h3><p>{roleLabel}</p></div></div><div className="settings-form-grid"><TextField label="First Name" value={profile.firstName} onChange={(value) => updateField("firstName", value)} /><TextField label="Last Name" value={profile.lastName} onChange={(value) => updateField("lastName", value)} /><ReadOnlyField label="Email" value={email || "—"} /><ReadOnlyField label="Role" value={roleLabel} /><TextField label="Contact Number" value={profile.contactNumber} onChange={(value) => updateField("contactNumber", value)} /><TextField label="Department or Course" value={profile.department} onChange={(value) => updateField("department", value)} /></div><SettingsActions saving={saving} onCancel={cancelChanges} onReset={resetDefaults} /></form></section>}

          {activeSection === "account" && <section className="settings-card"><SettingsHeading icon={KeyRound} eyebrow="Account access" title="Account" description="Manage your password and sign out of this account." /><form className="settings-subsection" onSubmit={changePassword}><h3>Change Password</h3><p>Use your current password to set a new secure password.</p><div className="settings-password-grid"><PasswordField label="Current password" value={passwords.current} onChange={(value) => updatePasswordField("current", value)} visible={showPasswords} /><PasswordField label="New password" value={passwords.next} onChange={(value) => updatePasswordField("next", value)} visible={showPasswords} /><PasswordField label="Confirm new password" value={passwords.confirm} onChange={(value) => updatePasswordField("confirm", value)} visible={showPasswords} /></div><label className="settings-check"><input type="checkbox" checked={showPasswords} onChange={(event) => setShowPasswords(event.target.checked)} /> Show password characters</label><button type="submit" className="settings-primary-button">Change Password</button></form><div className="settings-option-row"><div className="settings-option-icon red"><LogOut size={17} /></div><div><strong>Logout</strong><span>Sign out of your current account.</span></div><button type="button" className="settings-danger-button" onClick={() => signOut(auth)}>Logout</button></div></section>}

          {activeSection === "appearance" && <section className="settings-card"><SettingsHeading icon={Palette} eyebrow="Workspace display" title="Appearance" description="Choose the theme used across your account." /><div className="settings-subsection"><h3>Theme</h3><p>Your choice is applied immediately and saved to your profile.</p><div className="theme-grid">{[{ name: "Light", icon: Monitor, copy: "Bright and focused" }, { name: "Dark", icon: Palette, copy: "Easy on the eyes" }, { name: "System", icon: Smartphone, copy: "Follow device setting" }].map(({ name, icon: Icon, copy }) => <button type="button" key={name} className={`theme-card ${theme === name ? "selected" : ""}`} onClick={() => setTheme(name)}><span><Icon size={19} /></span><strong>{name} mode</strong><small>{copy}</small>{theme === name && <i><Check size={13} /></i>}</button>)}</div></div><SettingsActions saving={saving} onCancel={cancelChanges} onReset={resetDefaults} onSave={saveChanges} /></section>}

          {activeSection === "notifications" && <section className="settings-card"><SettingsHeading icon={Bell} eyebrow="Stay informed" title="Notifications" description="Choose which updates should appear in your workspace." /><div className="notification-list"><NotificationRow title="Application Notifications" description="Receive updates when applications change." checked={notifications.application} onChange={() => setNotifications((current) => ({ ...current, application: !current.application }))} /><NotificationRow title="Attendance Notifications" description="Get alerts when attendance needs review." checked={notifications.attendance} onChange={() => setNotifications((current) => ({ ...current, attendance: !current.attendance }))} />          <NotificationRow title="My Journal Notifications" description="Get updates when reports are ready." checked={notifications.reports} onChange={() => setNotifications((current) => ({ ...current, reports: !current.reports }))} /><NotificationRow title="Evaluation Notifications" description="Know when an evaluation is submitted." checked={notifications.evaluation} onChange={() => setNotifications((current) => ({ ...current, evaluation: !current.evaluation }))} /></div><SettingsActions saving={saving} onCancel={cancelChanges} onReset={resetDefaults} onSave={saveChanges} /></section>}

          {activeSection === "security" && <section className="settings-card"><SettingsHeading icon={ShieldCheck} eyebrow="Account protection" title="Security" description="Review the account details used to protect your access." /><div className="security-grid"><div className="security-detail"><span>Email</span><strong>{email || "—"}</strong><small>Firebase Authentication account</small></div><div className="security-detail"><span>Account Role</span><strong>{roleLabel}</strong><small>Role changes are managed by administrators.</small></div><div className="security-detail"><span>Account Status</span><strong>Active</strong><small>Your account is currently enabled.</small></div></div><div className="settings-option-row"><div className="settings-option-icon"><ShieldCheck size={17} /></div><div><strong>Change password</strong><span>Use your current password to update your credentials.</span></div><button type="button" className="settings-row-button" onClick={() => setActiveSection("account")}>Change <ChevronRight size={15} /></button></div></section>}
        </div>
      </div>
    </main>
  );
}

function SettingsHeading({ icon: Icon, eyebrow, title, description }) { return <div className="settings-card-heading"><span className="settings-heading-icon"><Icon size={18} /></span><div><p>{eyebrow}</p><h2>{title}</h2><span>{description}</span></div></div>; }
function TextField({ label, value, onChange }) { return <label className="settings-field"><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
function ReadOnlyField({ label, value }) { return <label className="settings-field"><span>{label}</span><input value={value} readOnly /></label>; }
function PasswordField({ label, value, onChange, visible }) { return <label className="settings-field"><span>{label}</span><input type={visible ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} autoComplete="current-password" /></label>; }
function NotificationRow({ title, description, checked, onChange }) { return <div className="notification-row"><div><strong>{title}</strong><span>{description}</span></div><button type="button" role="switch" aria-checked={checked} aria-label={title} className={`settings-toggle ${checked ? "on" : ""}`} onClick={onChange}><span /></button></div>; }
function SettingsActions({ saving, onCancel, onReset, onSave }) { return <div className="settings-card-actions"><button type="button" className="settings-cancel-button" onClick={onCancel}><X size={14} /> Cancel</button><button type="button" className="settings-outline-button" onClick={onReset}>Reset to Default</button><button type={onSave ? "button" : "submit"} className="settings-primary-button" onClick={onSave} disabled={saving}><Save size={14} /> {saving ? "Saving..." : "Save Changes"}</button></div>; }

export default Settings;
