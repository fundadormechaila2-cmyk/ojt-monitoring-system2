import "../styles/login.css";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import {
  AlertCircle,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  X,
} from "lucide-react";
import { login, logout, sendPasswordReset } from "../services/authService";
import {
  hasAcceptedTerms,
  recordTermsAcceptance,
  TERMS_VERSION,
} from "../services/termsAcceptanceService";
import { useAuth } from "../context/useAuth";
import { getUserData } from "../services/userService";
import { isAccountLive } from "../services/recordState";
import { completePasswordChange } from "../services/userManagementSevice";
import { auth } from "../services/firebase";
import { logLoginDiagnostic } from "../services/temporaryLoginDiagnostics";
import TermsModal from "../components/TermsModal";
import schoolLogo from "../assets/school-logo.png";

const ROLE_HOME = {
  admin: "/admin",
  coordinator: "/coordinator",
  student: "/Student",
  supervisor: "/supervisor",
};

const PASSWORD_RULES = [
  { id: "length", label: "At least 8 characters", test: (v) => v.length >= 8 },
  { id: "upper", label: "One uppercase letter", test: (v) => /[A-Z]/.test(v) },
  { id: "lower", label: "One lowercase letter", test: (v) => /[a-z]/.test(v) },
  { id: "number", label: "One number", test: (v) => /\d/.test(v) },
  { id: "special", label: "One special character", test: (v) => /[^A-Za-z0-9]/.test(v) },
];

const STRENGTH_LABELS = ["Too weak", "Weak", "Fair", "Good", "Strong", "Very strong"];

function PasswordField({ id, label, value, onChange, autoComplete, placeholder, describedBy }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="input-group">
      <label htmlFor={id}>{label}</label>
      <div className="field-shell">
        <Lock className="field-icon" size={17} aria-hidden="true" />
        <input
          id={id}
          type={visible ? "text" : "password"}
          placeholder={placeholder}
          value={value}
          autoComplete={autoComplete}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          className="password-toggle"
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  );
}

function ChangePasswordModal({ initialCurrent, onDone, onCancel }) {
  const [current, setCurrent] = useState(initialCurrent);
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const firstFieldRef = useRef(null);

  useEffect(() => {
    firstFieldRef.current?.querySelector("input")?.focus();
  }, []);

  const passed = PASSWORD_RULES.filter((rule) => rule.test(next)).length;
  const allRulesMet = passed === PASSWORD_RULES.length;
  const matches = confirm.length > 0 && next === confirm;
  const canSubmit =
    Boolean(current) &&
    allRulesMet &&
    matches &&
    next !== current &&
    !saving;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError("");
    setSaving(true);

    try {
      const firebaseUser = auth.currentUser;
      const credential = EmailAuthProvider.credential(firebaseUser.email, current);
      await reauthenticateWithCredential(firebaseUser, credential);
      await completePasswordChange(firebaseUser, current, next);
      await reauthenticateWithCredential(firebaseUser, EmailAuthProvider.credential(firebaseUser.email, next));
      onDone();
    } catch (err) {
      const wrongPassword = ["auth/wrong-password", "auth/invalid-credential"].includes(err.code);
      setError(
        wrongPassword
          ? "Your sign-in session could not be verified. Cancel and sign in again."
          : err.code === "auth/requires-recent-login"
            ? "Your sign-in session has expired. Cancel and sign in again."
            : err.message,
      );
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-title"
      >
        <div className="modal-icon" aria-hidden="true">
          <ShieldCheck size={24} />
        </div>
        <h2 id="change-password-title">Create your new password</h2>
        <p className="modal-subtitle">
          For your security, you must replace your temporary password before continuing.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          {!initialCurrent && (
            <PasswordField
              id="current-password"
              label="Current password"
              value={current}
              onChange={setCurrent}
              autoComplete="current-password"
              placeholder="Enter your current password"
            />
          )}
          <div ref={firstFieldRef}>
            <PasswordField
              id="new-password"
              label="New password"
              value={next}
              onChange={setNext}
              autoComplete="new-password"
              placeholder="Create a strong password"
              describedBy="password-rules"
            />
          </div>

          <div className="strength" aria-live="polite">
            <div className="strength-bar" aria-hidden="true">
              {PASSWORD_RULES.map((rule, index) => (
                <span
                  key={rule.id}
                  className={index < passed ? `filled level-${passed}` : ""}
                />
              ))}
            </div>
            <span className="strength-label">{next ? STRENGTH_LABELS[passed] : ""}</span>
          </div>

          <ul id="password-rules" className="rules">
            {PASSWORD_RULES.map((rule) => {
              const ok = rule.test(next);
              return (
                <li key={rule.id} className={ok ? "met" : ""}>
                  {ok ? <Check size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}
                  <span>{rule.label}</span>
                  <span className="sr-only">{ok ? " (met)" : " (not met)"}</span>
                </li>
              );
            })}
          </ul>

          <PasswordField
            id="confirm-password"
            label="Confirm new password"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            placeholder="Re-enter your new password"
          />
          {confirm && !matches && <p className="field-hint error">Passwords do not match.</p>}
          {next && next === current && (
            <p className="field-hint error">New password must differ from the temporary one.</p>
          )}

          {error && (
            <div className="alert alert-error" role="alert">
              <AlertCircle size={16} aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <button className="login-submit" type="submit" disabled={!canSubmit}>
            {saving ? <Loader2 className="spin" size={16} /> : null}
            {saving ? "Saving..." : "Update password & continue"}
          </button>
          <button className="link-button" type="button" onClick={onCancel} disabled={saving}>
            Cancel and sign out
          </button>
        </form>
      </div>
    </div>
  );
}

function Login() {
  const { user, termsAccepted, termsStatusReady, markTermsAccepted, authError } = useAuth();
  const navigate = useNavigate();
  const emailInputRef = useRef(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(
    () => sessionStorage.getItem("account-session-message") || "",
  );
  const [resetError, setResetError] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingRole, setPendingRole] = useState(null);
  const [tempPassword, setTempPassword] = useState("");
  const [pendingTerms, setPendingTerms] = useState(null);
  const [termsChecked, setTermsChecked] = useState(false);
  const [termsError, setTermsError] = useState("");

  useEffect(() => {
    sessionStorage.removeItem("account-session-message");
  }, []);

  const needsReset = Boolean(user?.mustChangePassword) || pendingRole !== null;
  const activePendingTerms = pendingTerms || (
    user && termsStatusReady && !termsAccepted
      ? {
          uid: user.uid,
          role: user.role,
          mustChangePassword: Boolean(user.mustChangePassword),
          password: "",
        }
      : null
  );
  useEffect(() => {
    if (!user || !termsStatusReady || !termsAccepted || loading || pendingTerms) return;
    if (needsReset) return;
    const home = ROLE_HOME[user.role];
    if (home) navigate(home, { replace: true });
  }, [
    user,
    termsAccepted,
    termsStatusReady,
    needsReset,
    loading,
    pendingTerms,
    navigate,
  ]);

  const finishSignIn = ({ uid, role, mustChangePassword, password: signedInPassword }) => {
    markTermsAccepted(uid);
    setPendingTerms(null);
    setTermsChecked(false);
    setTermsError("");

    if (mustChangePassword) {
      setTempPassword(signedInPassword);
      setPendingRole(role);
      return;
    }

    navigate(ROLE_HOME[role], { replace: true });
  };

  const handleTermsAccept = async (e) => {
    e.preventDefault();
    setTermsError("");
    if (!activePendingTerms || !termsChecked || loading) return;

    if (auth.currentUser?.uid !== activePendingTerms.uid) {
      setTermsError("Your sign-in session changed. Please sign out and sign in again.");
      return;
    }

    setLoading(true);
    try {
      const alreadyAccepted = await hasAcceptedTerms(activePendingTerms.uid, TERMS_VERSION);
      if (!alreadyAccepted) {
        await recordTermsAcceptance(activePendingTerms.uid, TERMS_VERSION);
      }
      finishSignIn(activePendingTerms);
    } catch (err) {
      console.error("Unable to save Terms and Conditions acceptance:", err);
      setTermsError("We couldn't save your agreement. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleTermsSignOut = async () => {
    setLoading(true);
    setTermsError("");
    try {
      await logout();
      setPendingTerms(null);
      setTermsChecked(false);
      setPassword("");
    } catch (err) {
      console.error("Unable to sign out:", err);
      setTermsError("We couldn't sign you out. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setResetError("");
    setResetMessage("");

    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }

    setLoading(true);
    let requestedUid = null;
    try {
      const credential = await login(email, password);
      requestedUid = credential.user.uid;
      logLoginDiagnostic({ stage: "auth-success", source: "Login.handleLogin", path: `users/${requestedUid}`, requestedUid });
      const userData = await getUserData(credential.user.uid, "Login.handleLogin");

      if (!userData || !Object.hasOwn(ROLE_HOME, userData.role) || !isAccountLive(userData)) {
        await logout();
        setTermsChecked(false);
        setError("Your account profile is missing, inactive, or has an invalid role. Contact an administrator.");
        return;
      }

      const alreadyAccepted = await hasAcceptedTerms(credential.user.uid, TERMS_VERSION);
      if (!alreadyAccepted) {
        setPendingTerms({
          uid: credential.user.uid,
          role: userData.role,
          mustChangePassword: Boolean(userData.mustChangePassword),
          password,
        });
        setTermsChecked(false);
        return;
      }

      finishSignIn({
        uid: credential.user.uid,
        role: userData.role,
        mustChangePassword: Boolean(userData.mustChangePassword),
        password,
      });
    } catch (err) {
      logLoginDiagnostic({ stage: "login-error", source: "Login.handleLogin", requestedUid, error: err });
      setTermsChecked(false);
      if (requestedUid && auth.currentUser?.uid === requestedUid) {
        try {
          await logout();
        } catch (signOutError) {
          console.error("Unable to sign out after a login error:", signOutError);
        }
      }
      const invalid = ["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"];
      setError(invalid.includes(err.code) ? "Incorrect email or password." : "Unable to complete sign-in. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    setResetError("");
    setResetMessage("");
    setError("");

    if (!email.trim()) {
      setResetError("Enter your email address above to receive a password reset link.");
      emailInputRef.current?.focus();
      return;
    }

    if (!emailInputRef.current?.checkValidity()) {
      emailInputRef.current?.reportValidity();
      return;
    }

    setResetLoading(true);
    try {
      await sendPasswordReset(email);
      setResetMessage(
        "If an account exists for this email, password reset instructions will be sent shortly. Check your inbox and spam folder.",
      );
    } catch (err) {
      if (err.code === "auth/user-not-found") {
        setResetMessage(
          "If an account exists for this email, password reset instructions will be sent shortly. Check your inbox and spam folder.",
        );
      } else if (err.code === "auth/too-many-requests") {
        setResetError("Too many reset attempts. Please wait a while before trying again.");
      } else if (err.code === "auth/invalid-email") {
        setResetError("Enter a valid email address and try again.");
      } else {
        console.error("Unable to send password reset email:", err);
        setResetError("We couldn't send a reset email right now. Please try again later or contact your administrator.");
      }
    } finally {
      setResetLoading(false);
    }
  };

  const handlePasswordChanged = () => {
    const target = ROLE_HOME[pendingRole || user?.role];
    setPendingRole(null);
    setTempPassword("");
    if (target) navigate(target, { replace: true });
  };

  const handleCancelReset = async () => {
    await logout();
    setPendingRole(null);
    setTempPassword("");
    setPassword("");
  };

  return (
    <div className="login-container">
      <main className="login-card">
        <div className="workspace-page-hero login-hero">
          <header className="login-heading">
            <img
              className="login-logo"
              src={schoolLogo}
              alt="La Consolacion College Isabela logo"
            />
            <p className="login-brand-title">La Consolacion College-Isabela</p>
            <p>OJT Monitoring System</p>
          </header>

          <div className="welcome">
            <h2>Welcome back</h2>
            <p>Sign in to continue to your account.</p>
          </div>
        </div>

        <div className="alert alert-info" role="note">
          <span>
            <strong>First time here?</strong> Follow the password setup link sent to your email.
          </span>
        </div>

        <form onSubmit={handleLogin} noValidate>
          <div className="input-group">
            <label htmlFor="email">Email address</label>
            <div className="field-shell">
              <Mail className="field-icon" size={17} aria-hidden="true" />
              <input
                id="email"
                ref={emailInputRef}
                type="email"
                placeholder="you@example.com"
                autoComplete="username"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setResetError("");
                  setResetMessage("");
                }}
              />
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="password">Password</label>
            <div className="field-shell">
              <Lock className="field-icon" size={17} aria-hidden="true" />
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Password or temporary password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                className="password-toggle"
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            className="link-button forgot-password"
            type="button"
            onClick={handlePasswordReset}
            disabled={loading || resetLoading}
          >
            {resetLoading ? (
              <>
                <Loader2 className="spin" size={14} aria-hidden="true" />
                Sending reset link...
              </>
            ) : (
              "Forgot password?"
            )}
          </button>

          {resetMessage && (
            <div className="alert alert-success" role="status">
              <Check size={16} aria-hidden="true" />
              <span>{resetMessage}</span>
            </div>
          )}

          {resetError && (
            <div className="alert alert-error" role="alert">
              <AlertCircle size={16} aria-hidden="true" />
              <span>{resetError}</span>
            </div>
          )}

          {(error || authError) && (
            <div className="alert alert-error" role="alert">
              <AlertCircle size={16} aria-hidden="true" />
              <span>{error || authError}</span>
            </div>
          )}

          <button className="login-submit" type="submit" disabled={loading || resetLoading}>
            {loading ? <Loader2 className="spin" size={16} /> : null}
            {loading ? "Signing in..." : "Sign in"}
          </button>
          <p className="login-terms">By signing in, you agree to the Terms and Conditions.</p>
        </form>

        <p className="login-footer">Having trouble? Contact your OJT coordinator or administrator.</p>
      </main>

      {needsReset && termsAccepted && !activePendingTerms && (
        <ChangePasswordModal
          initialCurrent={tempPassword}
          onDone={handlePasswordChanged}
          onCancel={handleCancelReset}
        />
      )}
      {activePendingTerms && (
        <TermsModal
          checked={termsChecked}
          onCheckedChange={(event) => {
            setTermsChecked(event.target.checked);
            setTermsError("");
          }}
          onAccept={handleTermsAccept}
          onSignOut={handleTermsSignOut}
          loading={loading}
          error={termsError}
        />
      )}
    </div>
  );
}

export default Login;
