import { useState } from "react";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
import { Eye, EyeOff, Lock } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { auth } from "../../services/firebase";
import "../../styles/student-portal.css";

function Settings() {
  const { user } = useAuth();
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [savingPassword, setSavingPassword] = useState(false);
  const [isPasswordFormOpen, setIsPasswordFormOpen] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [visiblePasswords, setVisiblePasswords] = useState({
    current: false,
    next: false,
    confirm: false,
  });

  const updatePasswordField = (field, value) => {
    setPasswordForm((current) => ({ ...current, [field]: value }));
  };

  const togglePasswordVisibility = (field) => {
    setVisiblePasswords((current) => ({ ...current, [field]: !current[field] }));
  };

  const cancelPasswordChange = () => {
    setPasswordForm({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
    setVisiblePasswords({ current: false, next: false, confirm: false });
    setNotice("");
    setError("");
    setIsPasswordFormOpen(false);
  };

  const changePassword = async (event) => {
    event.preventDefault();
    const firebaseUser = auth.currentUser;
    const email = firebaseUser?.email || user?.email;
    setNotice("");
    setError("");

    if (!firebaseUser || !email) {
      setError("Your session has expired. Please sign in again.");
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError("New password and confirm password do not match.");
      return;
    }

    setSavingPassword(true);
    try {
      await reauthenticateWithCredential(
        firebaseUser,
        EmailAuthProvider.credential(email, passwordForm.currentPassword),
      );
      await updatePassword(firebaseUser, passwordForm.newPassword);
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setIsPasswordFormOpen(false);
      setNotice("Password changed successfully.");
    } catch (passwordError) {
      console.error("Unable to change student password:", passwordError);
      setError(
        passwordError.code === "auth/wrong-password" ||
          passwordError.code === "auth/invalid-credential"
          ? "Current password is incorrect."
          : passwordError.code === "auth/requires-recent-login"
            ? "Please sign in again before changing your password."
            : "Unable to change password. Please try again.",
      );
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="student-portal-page">
      <header className="student-page-header">
        <div>
          <p className="student-meta">User preferences</p>
          <h1>Settings</h1>
        </div>
      </header>

      {notice && <div className="student-profile-notice" role="status">{notice}</div>}
      {error && <div className="student-profile-error" role="alert">{error}</div>}

      <section className="student-card student-panel student-security-panel">
        <div className="student-panel-header student-security-heading">
          <span className="student-security-card-icon">
            <Lock size={18} />
          </span>
          <div>
            <p className="student-panel-subtitle">Account protection</p>
            <h2 className="student-panel-title">Security</h2>
          </div>
        </div>

        {isPasswordFormOpen ? (
          <form className="student-password-form" onSubmit={changePassword}>
            <h3>Change Password</h3>
            <p>Verify your current password before choosing a new one.</p>
          <div className="student-form-grid">
            <div className="student-field">
              <label htmlFor="student-current-password">Current password</label>
              <div className="student-password-input">
                <input
                  id="student-current-password"
                  type={visiblePasswords.current ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={passwordForm.currentPassword}
                  onChange={(event) => updatePasswordField("currentPassword", event.target.value)}
                />
                <button
                  type="button"
                  className="student-password-visibility"
                  aria-label={visiblePasswords.current ? "Hide current password" : "Show current password"}
                  aria-pressed={visiblePasswords.current}
                  onClick={() => togglePasswordVisibility("current")}
                >
                  {visiblePasswords.current ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>
            <div className="student-field">
              <label htmlFor="student-new-password">New password</label>
              <div className="student-password-input">
                <input
                  id="student-new-password"
                  type={visiblePasswords.next ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={6}
                  aria-describedby="student-password-requirements"
                  value={passwordForm.newPassword}
                  onChange={(event) => updatePasswordField("newPassword", event.target.value)}
                />
                <button
                  type="button"
                  className="student-password-visibility"
                  aria-label={visiblePasswords.next ? "Hide new password" : "Show new password"}
                  aria-pressed={visiblePasswords.next}
                  onClick={() => togglePasswordVisibility("next")}
                >
                  {visiblePasswords.next ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              <small className="student-password-requirements" id="student-password-requirements">
                Password must be at least 6 characters.
              </small>
            </div>
            <div className="student-field">
              <label htmlFor="student-confirm-password">Confirm new password</label>
              <div className="student-password-input">
                <input
                  id="student-confirm-password"
                  type={visiblePasswords.confirm ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  value={passwordForm.confirmPassword}
                  onChange={(event) => updatePasswordField("confirmPassword", event.target.value)}
                />
                <button
                  type="button"
                  className="student-password-visibility"
                  aria-label={visiblePasswords.confirm ? "Hide confirmed password" : "Show confirmed password"}
                  aria-pressed={visiblePasswords.confirm}
                  onClick={() => togglePasswordVisibility("confirm")}
                >
                  {visiblePasswords.confirm ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>
          </div>
            <div className="student-actions-row">
              <button
                type="button"
                className="student-button secondary"
                onClick={cancelPasswordChange}
                disabled={savingPassword}
              >
                Cancel
              </button>
              <button type="submit" className="student-button primary" disabled={savingPassword}>
                {savingPassword ? "Changing password..." : "Change Password"}
              </button>
            </div>
          </form>
        ) : (
          <div className="student-password-form">
            <h3>Change Password</h3>
            <p>Update your password to keep your account secure.</p>
            <button
              type="button"
              className="student-button primary"
              onClick={() => setIsPasswordFormOpen(true)}
            >
              Change Password
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

export default Settings;
