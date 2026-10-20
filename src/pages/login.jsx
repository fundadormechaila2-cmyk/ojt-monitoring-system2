import "../styles/login.css";
import { useState } from "react";
import { login } from "../services/authService";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "../context/useAuth";
import { getUserData } from "../services/userService";
import { Eye, EyeOff } from "lucide-react";
import schoolLogo from "../assets/school-logo.png";

function Login() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();

    if (!email || !password) {
      alert("Please enter your email and password.");
      return;
    }

    try {
      const userCredential = await login(email, password);
      const userData = await getUserData(userCredential.user.uid);
      console.log(userData);

      alert("Login Successful!");

      if (!userData) {
        alert("User profile not found.");
        return;
      }
      if (userData.role === "admin") {
        navigate("/admin");
      } else if (userData.role === "client") {
        navigate("/client");
      } else {
        alert("Invalid user role.");
      }
    } catch (error) {
      alert(error.message);
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
        }
      } catch (error) {
        console.error("Error checking user role:", error);
      }
    };

    redirectUser();
  }, [user, navigate]);



  return (
    <div className="login-container">
      <div className="login-card">
        <header className="login-heading">
          <img
            className="login-logo"
            src={schoolLogo}
            alt="La Consolacion College Isabela logo"
          />
          <h1>La Consolacion College-Isabela</h1>
          <p>OJT Monitoring System</p>
        </header>

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

          <div className="input-group">
            <label htmlFor="password">Password</label>
            <div className="password-input">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                className="password-toggle"
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          <button className="login-submit" type="submit">Login</button>
        </form>
      </div>
    </div>
  );
}

export default Login;
