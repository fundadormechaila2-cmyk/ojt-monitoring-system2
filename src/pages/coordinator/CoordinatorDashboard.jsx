import { AlertTriangle, ArrowRight, BookOpen, CheckCircle2, ClipboardCheck, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import { CoordinatorState, useCoordinatorData } from "./coordinatorData";
import "../../styles/coordinatordashboard.css";

function CoordinatorDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, loading, error } = useCoordinatorData();
  const attendanceIssues = data.attendance.filter((item) =>
    ["absent", "late", "incomplete"].includes(String(item.status || "").toLowerCase()),
  );
  const stats = [
    ["Assigned Students", data.students.length, Users, "students"],
    ["Attendance Issues", attendanceIssues.length, AlertTriangle, "attendance"],
  ];

  return (
    <CoordinatorState loading={loading} error={error}>
      <main className="coordinator-dashboard">
        <header className="coordinator-dashboard-header">
          <div>
            <p className="dashboard-eyebrow">OJT coordination workspace</p>
            <h1>Coordinator Dashboard</h1>
            <p>Welcome back, {user?.firstName || user?.email || "Coordinator"}. Here is your current monitoring overview.</p>
          </div>
          <button type="button" className="coordinator-primary-action" onClick={() => navigate("/coordinator/attendance")}>
            <ClipboardCheck size={16} /> View attendance
          </button>
        </header>

        <section className="coordinator-stats" aria-label="Coordinator summary">
          {stats.map(([label, value, Icon, path]) => (
            <button type="button" className="coordinator-stat" key={label} onClick={() => navigate(`/coordinator/${path}`)}>
              <Icon size={20} /><span>{label}</span><strong>{value}</strong><ArrowRight size={16} />
            </button>
          ))}
        </section>

        <section className="coordinator-dashboard-grid">
          <article className="coordinator-panel">
            <div className="coordinator-panel-heading">
              <h2>Attendance attention</h2>
              <button type="button" onClick={() => navigate("/coordinator/attendance")}>Review <ArrowRight size={15} /></button>
            </div>
            {attendanceIssues.length === 0 ? (
              <p className="coordinator-empty"><CheckCircle2 size={18} /> No attendance issues.</p>
            ) : (
              <div className="coordinator-attention">
                <strong>{attendanceIssues.length}</strong><span>records need review</span>
                <p>Late, absent, or incomplete attendance entries are waiting for your attention.</p>
              </div>
            )}
          </article>
        </section>

        <section className="coordinator-panel coordinator-quick-actions">
          <h2>Quick actions</h2>
          <div>
            <button type="button" onClick={() => navigate("/coordinator/students")}>View students</button>
            <button type="button" onClick={() => navigate("/coordinator/journals")}><BookOpen size={16} /> View student journals</button>
          </div>
        </section>
        <p className="coordinator-dashboard-note">Attendance is recorded by supervisors. Applications, partner companies, and reports are not yet available.</p>
      </main>
    </CoordinatorState>
  );
}

export default CoordinatorDashboard;
