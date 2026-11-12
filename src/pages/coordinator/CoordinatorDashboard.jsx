import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, Building2, CheckCircle2, ClipboardCheck, FileText, Users } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { db } from "../../services/firebase";
import "../../styles/coordinatordashboard.css";

const sources = ["students", "applications", "attendance", "partnerCompanies"];

function displayValue(record, keys, fallback = "") {
  return keys.map((key) => record[key]).find((value) => value !== undefined && value !== null && value !== "") ?? fallback;
}

function CoordinatorDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(Object.fromEntries(sources.map((source) => [source, []])));
  const [loading, setLoading] = useState(true);
  const [failedSources, setFailedSources] = useState([]);

  useEffect(() => {
    const ready = new Set();
    const subscriptions = sources.map((source) => onSnapshot(collection(db, source), (snapshot) => {
      setData((current) => ({ ...current, [source]: snapshot.docs.map((item) => ({ id: item.id, ...item.data() })) }));
      setFailedSources((current) => current.filter((item) => item !== source));
      ready.add(source);
      if (ready.size === sources.length) setLoading(false);
    }, (error) => {
      console.error(`Unable to load coordinator dashboard ${source}:`, error);
      setFailedSources((current) => current.includes(source) ? current : [...current, source]);
      ready.add(source);
      if (ready.size === sources.length) setLoading(false);
    }));

    return () => subscriptions.forEach((unsubscribe) => unsubscribe());
  }, []);

  const students = data.students;
  const applications = data.applications;
  const attendance = data.attendance;
  const pendingApplications = applications.filter((item) => String(item.status || "").toLowerCase() === "pending");
  const attendanceIssues = attendance.filter((item) => ["absent", "late", "incomplete"].includes(String(item.status || "").toLowerCase()));
  const recentApplications = useMemo(() => [...applications].slice(-5).reverse(), [applications]);
  const stats = [
    ["Assigned Students", students.length, Users, "students"],
    ["Pending Applications", pendingApplications.length, FileText, "application"],
    ["Attendance Issues", attendanceIssues.length, AlertTriangle, "attendancereports"],
    ["Partner Companies", data.partnerCompanies.length, Building2, "partnercompanies"],
  ];

  if (loading) return <main className="coordinator-dashboard coordinator-dashboard-state">Loading coordinator dashboard...</main>;

  return (
    <main className="coordinator-dashboard">
      <header className="coordinator-dashboard-header">
        <div>
          <p className="dashboard-eyebrow">OJT coordination workspace</p>
          <h1>Coordinator Dashboard</h1>
          <p>Welcome back, {user?.firstName || user?.email || "Coordinator"}. Here is your current monitoring overview.</p>
        </div>
        <button type="button" className="coordinator-primary-action" onClick={() => navigate("/coordinator/attendance")}><ClipboardCheck size={16} /> Record attendance</button>
      </header>

      {failedSources.length > 0 && <div className="coordinator-dashboard-error" role="alert">Unable to load: {failedSources.join(", ")}. Check Firestore permissions.</div>}

      <section className="coordinator-stats" aria-label="Coordinator summary">
        {stats.map(([label, value, Icon, path]) => <button type="button" className="coordinator-stat" key={label} onClick={() => navigate(`/coordinator/${path}`)}><Icon size={20} /><span>{label}</span><strong>{value}</strong><ArrowRight size={16} /></button>)}
      </section>

      <section className="coordinator-dashboard-grid">
        <article className="coordinator-panel"><div className="coordinator-panel-heading"><h2>Pending applications</h2><button type="button" onClick={() => navigate("/coordinator/application")}>View all <ArrowRight size={15} /></button></div>{pendingApplications.length === 0 ? <p className="coordinator-empty">No pending applications.</p> : <div className="coordinator-list">{pendingApplications.slice(0, 5).map((item) => <div className="coordinator-list-item" key={item.id}><div><strong>{displayValue(item, ["studentName", "student", "name"], "Unnamed student")}</strong><span>{displayValue(item, ["company", "partnerCompany", "companyName"], "Company not assigned")}</span></div><span className="coordinator-status pending">Pending</span></div>)}</div>}</article>
        <article className="coordinator-panel"><div className="coordinator-panel-heading"><h2>Attendance attention</h2><button type="button" onClick={() => navigate("/coordinator/attendancereports")}>Review <ArrowRight size={15} /></button></div>{attendanceIssues.length === 0 ? <p className="coordinator-empty"><CheckCircle2 size={18} /> No attendance issues.</p> : <div className="coordinator-attention"><strong>{attendanceIssues.length}</strong><span>records need review</span><p>Late, absent, or incomplete attendance entries are waiting for your attention.</p></div>}</article>
      </section>

      <section className="coordinator-panel coordinator-quick-actions"><h2>Quick actions</h2><div><button type="button" onClick={() => navigate("/coordinator/students")}>View students</button><button type="button" onClick={() => navigate("/coordinator/application")}>Review applications</button><button type="button" onClick={() => navigate("/coordinator/ojtreports")}>Open OJT reports</button></div></section>
      <p className="coordinator-dashboard-note">Monitoring data is shared with the OJT management team.</p>
      {recentApplications.length > 0 && <span className="sr-only">{recentApplications.length} recent applications loaded.</span>}
    </main>
  );
}

export default CoordinatorDashboard;
