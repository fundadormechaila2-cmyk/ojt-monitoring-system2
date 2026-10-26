import "../styles/login.css";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import {
  AlertCircle,
  Check,
  Eye,
  EyeOff,
  GraduationCap,
  Info,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  UserCog,
  Briefcase,
  X,
} from "lucide-react";
import { login, logout } from "../services/authService";
import { useAuth } from "../context/useAuth";
import { getUserData } from "../services/userService";
import { completePasswordChange } from "../services/userManagementSevice";
import { auth } from "../services/firebase";
import schoolLogo from "../assets/school-logo.png";

const ROLES = [
  { id: "student", label: "OJT Student", icon: GraduationCap },
  { id: "coordinator", label: "Adviser", icon: UserCog },
  { id: "supervisor", label: "Supervisor", icon: Briefcase },
  { id: "admin", label: "Admin", icon: ShieldCheck },
];

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
    Boolean(initialCurrent) &&
    allRulesMet &&
    matches &&
    next !== initialCurrent &&
    !saving;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError("");
    setSaving(true);

    try {
      const firebaseUser = auth.currentUser;
      const credential = EmailAuthProvider.credential(firebaseUser.email, initialCurrent);
      await reauthenticateWithCredential(firebaseUser, credential);
      await completePasswordChange(firebaseUser, next);
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
          {next && next === initialCurrent && (
            <p className="field-hint error">New password must differ from the temporary one.</p>
          )}

          {!initialCurrent && (
            <div className="alert alert-error" role="alert">
              <AlertCircle size={16} aria-hidden="true" />
              <span>Please sign out and sign in again to continue changing your password.</span>
            </div>
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
  const { user } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState("student");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingRole, setPendingRole] = useState(null);
  const [tempPassword, setTempPassword] = useState("");

  // Also covers resuming an unfinished forced reset after a page refresh.
  const needsReset = Boolean(user?.mustChangePassword) || pendingRole !== null;

  useEffect(() => {
    if (!user || needsReset || loading) return;
    const home = ROLE_HOME[user.role];
    if (home) navigate(home, { replace: true });
  }, [user, needsReset, loading, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }

    setLoading(true);
    try {
      const credential = await login(email, password);
      const userData = await getUserData(credential.user.uid);

      if (!userData || !ROLE_HOME[userData.role]) {
        await logout();
        setError("Your account profile is missing or has an invalid role.");
        return;
      }

      if (userData.role !== role) {
        await logout();
        const selected = ROLES.find((r) => r.id === role).label;
        setError(`This account is not registered as ${selected}. Please choose the correct role.`);
        return;
      }

      if (userData.mustChangePassword) {
        setTempPassword(password);
        setPendingRole(userData.role);
        return;
      }

      navigate(ROLE_HOME[userData.role], { replace: true });
    } catch (err) {
      const invalid = ["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"];
      setError(invalid.includes(err.code) ? "Incorrect email or password." : err.message);
    } finally {
      setLoading(false);
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
        <header className="login-heading">
          <img
            className="login-logo"
            src={schoolLogo}
            alt="La Consolacion College Isabela logo"
          />
          <h1>La Consolacion College-Isabela</h1>
          <p>OJT Monitoring System</p>
        </header>

        <div className="welcome">
          <h2>Welcome back</h2>
          <p>Sign in to continue to your account.</p>
        </div>

        <div className="role-tabs" role="radiogroup" aria-label="Sign in as">
          {ROLES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={role === id}
              className={role === id ? "active" : ""}
              onClick={() => setRole(id)}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className="alert alert-info">
          <Info size={16} aria-hidden="true" />
          <span>
            <strong>First time here?</strong> Use the temporary password sent to your email or
            given by your administrator. You will be asked to create a new one.
          </span>
        </div>

        <form onSubmit={handleLogin} noValidate>
          <div className="input-group">
            <label htmlFor="email">Email address</label>
            <div className="field-shell">
              <Mail className="field-icon" size={17} aria-hidden="true" />
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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

          {error && (
            <div className="alert alert-error" role="alert">
              <AlertCircle size={16} aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <button className="login-submit" type="submit" disabled={loading}>
            {loading ? <Loader2 className="spin" size={16} /> : null}
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="login-footer">Having trouble? Contact your OJT coordinator or administrator.</p>
      </main>

      {needsReset && (
        <ChangePasswordModal
          initialCurrent={tempPassword}
          onDone={handlePasswordChanged}
          onCancel={handleCancelReset}
        />
      )}
    </div>
  );
}

export default Login;
