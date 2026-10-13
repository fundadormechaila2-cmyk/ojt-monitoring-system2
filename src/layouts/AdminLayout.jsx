import { Outlet, useNavigate, NavLink } from "react-router-dom";
import { logout } from "../services/authService";
import { useAuth } from "../context/useAuth";
import "../styles/AdminLayout.css";
import { useState } from "react";

import {
  LayoutDashboard,
  BookOpen,
  FileAxis3d,
  UserRound,
  ClipboardCheck,
  Settings,
  Menu,
  LogOut,
} from "lucide-react";

import schoolLogo from "../assets/school-logo.png";

function AdminLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const basePath = user?.role === "coordinator" ? "/coordinator" : "/admin";

  // State to manage the sidebar's open/closed state
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Toggle the sidebar open/closed state
  const toggleSidebar = () => {
    setSidebarOpen((previous) => !previous);
  };
  // Close the sidebar on mobile devices when a link is clicked
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

  return (
    <div
      // Apply different classes based on the sidebar's state
      className={`admin-layout ${
        sidebarOpen ? "sidebar-open" : "sidebar-closed"
      }`}
    >
      {/* HEADER */}
      <header className="admin-header">
        <div className="admin-header-left">
          {/* Sidebar Toggle */}
          <button
            type="button" //type attribute specifies the button's behavior
            className="sidebar-toggle" //className attribute assigns a CSS class for styling
            onClick={toggleSidebar} //onClick attribute specifies the function to be called when the button is clicked
            aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"} //aria-label attribute provides an accessible label for screen readers
            title={sidebarOpen ? "Close sidebar" : "Open sidebar"} //title attribute provides a tooltip when hovering over the button
          >
            <Menu size={22} />
          </button>

          {/* Application Title */}
          <div className="admin-title">
            <img
              src={schoolLogo}
              alt="La Consolacion College logo"
              className="admin-logo"
            />
            <h2>OJT Monitoring System LCCI</h2>
          </div>
        </div>

        {/* Admin User */}
        <div className="admin-user">
          <span title={user?.email || "Admin"}>
            {user?.firstName || user?.lastName
              ? `${user?.firstName || ""} ${user?.lastName || ""}`.trim()
              : user?.email || "Admin"}
          </span>

          <button type="button" className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <div className="admin-body">
        <aside className="sidebar">
          <NavLink
            to={basePath}
            end
            onClick={closeSidebarOnMobile}
            className={({ isActive }) =>
              isActive ? "nav-link active" : "nav-link"
            }
            title="Dashboard"
          >
            <span className="nav-icon">
              <LayoutDashboard size={18} />
            </span>

            <span className="nav-text">Dashboard</span>
          </NavLink>

          <NavLink
            to={`${basePath}/students`}
            end
            onClick={closeSidebarOnMobile}
            className={({ isActive }) =>
              isActive ? "nav-link active" : "nav-link"
            }
            title="Students"
          >
            <span className="nav-icon">
              <BookOpen size={18} />
            </span>

            <span className="nav-text">Students</span>
          </NavLink>

          {user?.role === "coordinator" && (
            <NavLink
              to={`${basePath}/attendance`}
              end
              onClick={closeSidebarOnMobile}
              className={({ isActive }) =>
                isActive ? "nav-link active" : "nav-link"
              }
              title="Attendance"
            >
              <span className="nav-icon">
                <ClipboardCheck size={18} />
              </span>
              <span className="nav-text">Attendance</span>
            </NavLink>
          )}

          {user?.role === "coordinator" && (
            <NavLink
              to={`${basePath}/supervisor`}
              end
              onClick={closeSidebarOnMobile}
              className={({ isActive }) =>
                isActive ? "nav-link active" : "nav-link"
              }
              title="Supervisor"
            >
              <span className="nav-icon">
                <UserRound size={18} />
              </span>
              <span className="nav-text">Supervisor</span>
            </NavLink>
          )}

          {user?.role === "admin" && (
            <NavLink
              to={`${basePath}/ojtcoordinators`}
              end
              onClick={closeSidebarOnMobile}
              className={({ isActive }) =>
                isActive ? "nav-link active" : "nav-link"
              }
              title="OJT Coordinators"
            >
              <span className="nav-icon">
                <FileAxis3d size={18} />
              </span>
              <span className="nav-text">OJT Coordinators</span>
            </NavLink>
          )}

          {user?.role === "admin" && (
            <NavLink
              to={`${basePath}/settings`}
              end
              onClick={closeSidebarOnMobile}
              className={({ isActive }) =>
                isActive ? "nav-link active" : "nav-link"
              }
              title="Settings"
            >
              <span className="nav-icon">
                <Settings size={18} />
              </span>

              <span className="nav-text">Settings</span>
            </NavLink>
          )}

          <button
            type="button"
            className="nav-link sidebar-logout"
            onClick={handleLogout}
            title="Logout"
          >
            <span className="nav-icon">
              <LogOut size={18} />
            </span>
            <span className="nav-text">Logout</span>
          </button>
        </aside>
        {/* MOBILE OVERLAY - this overlay is displayed on mobile devices when the sidebar is open. Clicking on it will close the sidebar. */}
        {sidebarOpen && (
          <div className="sidebar-overlay" onClick={toggleSidebar} />
        )}

        {/* MAIN CONTENT - this is where the main content of the admin dashboard will be rendered. The Outlet component is used to render the matched child route components.*/}
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default AdminLayout;
