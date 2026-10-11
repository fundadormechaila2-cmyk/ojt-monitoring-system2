import "../styles/login.css";
import schoolLogo from "../assets/school-logo.png";
import { useState, useEffect } from "react";
import { login } from "../services/authService";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { getUserData } from "../services/userService";
import { recordStudentLogin } from "../services/studentLoginActivityService";
import { Eye, EyeOff } from "lucide-react";

function Login() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();

    setErrorMessage("");

    if (!email || !password) {
      setErrorMessage("Please complete all required fields.");
      return;
    }

    try {
      const userCredential = await login(email, password);
      const sessionUser = userCredential?.user || userCredential;
      const profile = sessionUser?.role
        ? sessionUser
        : await getUserData(sessionUser?.uid);

      if (!profile) {
        alert("User profile not found.");
        return;
      }

      if (profile.role === "student" && !String(sessionUser?.uid || "").startsWith("demo-")) {
        try {
          await recordStudentLogin(sessionUser, profile);
        } catch (activityError) {
          console.error("Unable to record student sign-in activity:", activityError);
          alert(
            `Sign-in succeeded, but the coordinator could not be notified of this login. ${
              activityError.message || "Check your connection and Firestore permissions."
            }`,
          );
        }
      }

      if (profile.role === "admin") {
        navigate("/admin");
      } else if (profile.role === "client") {
        navigate("/client");
      } else if (profile.role === "coordinator") {
        navigate("/coordinator");
      } else if (profile.role === "student") {
        navigate("/Student");
      } else if (profile.role === "supervisor") {
        navigate("/supervisor");
      } else {
        alert("Invalid user role.");
      }
    } catch (error) {
      const authMessages = {
        "auth/invalid-credential":
          "The email or password is incorrect. Confirm that this account exists in Firebase Authentication.",
        "auth/user-not-found": "No Firebase account was found for this email.",
        "auth/wrong-password": "The password is incorrect.",
      };
      setErrorMessage(authMessages[error.code] || error.message);
    }
  };

  useEffect(() => {
    const redirectUser = async () => {
      if (!user) return;

      try {
        const userData = await getUserData(user.uid);

        if (!userData) return;

        if (userData.role === "admin") {
          navigate("/admin", { replace: true });
        } else if (userData.role === "client") {
          navigate("/client", { replace: true });
        } else if (userData.role === "student") {
          navigate("/Student", { replace: true });
        } else if (userData.role === "coordinator") {
          navigate("/coordinator", { replace: true });
        } else if (userData.role === "supervisor") {
          navigate("/supervisor", { replace: true });
        }
      } catch (error) {
        console.error("Error checking user role:", error);
      }
    };

    redirectUser();
  }, [user, navigate]);

  return (
    <div className="login-container">
      <div className="login-panel">
        <div className="login-badge" aria-label="University logo">
          <img src={schoolLogo} alt="La Consolacion College logo" />
        </div>

        <div className="login-brand">
          <h3>La Consolacion College-Isabela</h3>
          <span>OJT Monitoring System</span>
        </div>

        <form onSubmit={handleLogin}>
          <div className="input-group">
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="input-group password-group">
            <label htmlFor="password">Password</label>
            <div className="password-input-wrap">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="password-toggle"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {errorMessage && (
            <p className="login-error" role="alert">
              {errorMessage}
            </p>
          )}

          <button type="submit" className="login-submit-button">
            Login
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login;
