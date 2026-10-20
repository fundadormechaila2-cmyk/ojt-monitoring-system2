import "../styles/Login.css";
import { useState } from "react";
import { login } from "../services/AuthService";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { getUserData } from "../services/userService";
import { ArrowRight, BriefcaseBusiness } from "lucide-react";

function Login() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

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
      <div className="login-story">
        <div className="login-mark"><BriefcaseBusiness size={21} /></div>
        <p className="login-overline">LCCI · OJT MONITORING</p>
        <h1>Make every placement count.</h1>
        <p className="login-story-copy">A clearer view of students, partners, attendance, and progress, all in one place.</p>
        <div className="login-story-line"><span /> Built for better coordination</div>
      </div>
      <div className="login-card">
        <p className="login-card-kicker">Welcome back</p>
        <h2>Sign in to your workspace</h2>
        <p className="login-card-copy">Use your LCCI account to continue.</p>

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
            <input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button type="submit">Continue <ArrowRight size={17} /></button>
        </form>
      </div>
    </div>
  );
}

export default Login;
