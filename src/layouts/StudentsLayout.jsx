import { Outlet, useNavigate, NavLink } from "react-router-dom";
import { useState } from "react";
import {
  LayoutDashboard,
  FileUser,
  ListChecks,
  Summary,
  Settings,
  Menu,
} from "lucide-react";
import { logout } from "../services/authService";
import { useAuth } from "../context/useAuth";
import "../styles/AdminLayout.css";
import schoolLogo from "../assets/school-logo.png";

function StudentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const closeSidebarOnMobile = () => {
    if (window.innerWidth <= 700) setSidebarOpen(false);
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/");
    } catch (error) {
      alert(error.message);
    }
  };

  return (
    <div
      className={`admin-layout student-layout ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}`}
    >
      <header className="admin-header">
        <div className="admin-header-left">
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setSidebarOpen((isOpen) => !isOpen)}
            aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
            title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
          >
            <Menu size={22} />
          </button>
          <div className="admin-title">
            <img
              src={schoolLogo}
              alt="La Consolacion College logo"
              className="admin-logo"
            />
            <h2>Student OJT Portal</h2>
          </div>
        </div>

        <div className="admin-user">
          <span title={user?.email || "Student"}>
            {user?.firstName || user?.lastName
              ? `${user?.firstName || ""} ${user?.lastName || ""}`.trim()
              : user?.email || "Student"}
          </span>
          <button type="button" className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <div className="admin-body">
        <aside className="sidebar">
          <StudentNavLink
            to="/Student"
            label="Dashboard"
            icon={LayoutDashboard}
            end
            onClick={closeSidebarOnMobile}
          />
          <StudentNavLink
            to="/Student/profile"
            label="My Profile"
            icon={FileUser}
            onClick={closeSidebarOnMobile}
          />
          <StudentNavLink
            to="/Student/attendance"
            label="My Attendance"
            icon={ListChecks}
            onClick={closeSidebarOnMobile}
          />
          <StudentNavLink
            to="/Student/ojtreports"
            label="OJT Reports"
            icon={Summary}
            onClick={closeSidebarOnMobile}
          />
          <StudentNavLink
            to="/Student/settings"
            label="Settings"
            icon={Settings}
            onClick={closeSidebarOnMobile}
          />
        </aside>

        {sidebarOpen && (
          <div
            className="sidebar-overlay"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function StudentNavLink({ to, label, icon: Icon, end, onClick }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
      title={label}
    >
      <span className="nav-icon">
        <Icon size={18} />
      </span>
      <span className="nav-text">{label}</span>
    </NavLink>
  );
}

export default StudentDashboard;
