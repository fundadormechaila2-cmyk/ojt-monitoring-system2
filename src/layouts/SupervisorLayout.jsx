import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useState } from "react";
import {
  LayoutDashboard,
  Menu,
  QrCode,
  ClipboardList,
  Users,
} from "lucide-react";
import { logout } from "../services/authService";
import { useAuth } from "../context/useAuth";
import schoolLogo from "../assets/school-logo.png";
import "../styles/AdminLayout.css";

function SupervisorLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const closeSidebarOnMobile = () => {
    if (window.innerWidth <= 700) {
      setSidebarOpen(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/");
    } catch (error) {
      alert(error.message);
    }
  };

  const displayName =
    user?.firstName || user?.lastName
      ? `${user?.firstName || ""} ${user?.lastName || ""}`.trim()
      : user?.email || "Supervisor";

  return (
    <div
      className={`admin-layout supervisor-layout ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}`}
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
            <h2>Supervisor Portal</h2>
          </div>
        </div>

        <div className="admin-user">
          <span title={user?.email || "Supervisor"}>{displayName}</span>
          <button type="button" className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <div className="admin-body">
        <aside className="sidebar">
          <SupervisorNavLink
            to="/supervisor"
            label="Dashboard"
            icon={LayoutDashboard}
            end
            onClick={closeSidebarOnMobile}
          />
          <SupervisorNavLink
            to="/supervisor/scan-student-qr"
            label="Scan Student QR"
            icon={QrCode}
            onClick={closeSidebarOnMobile}
          />
          <SupervisorNavLink
            to="/supervisor/attendance"
            label="Attendance Records"
            icon={ClipboardList}
            onClick={closeSidebarOnMobile}
          />
          <SupervisorNavLink
            to="/supervisor/students"
            label="Student Interns"
            icon={Users}
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

function SupervisorNavLink({ to, label, icon: Icon, end, onClick }) {
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

export default SupervisorLayout;
