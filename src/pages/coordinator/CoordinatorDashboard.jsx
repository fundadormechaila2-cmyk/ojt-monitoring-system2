import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Building2, ClipboardCheck, Users } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { db } from "../../services/firebase";
import "../../styles/coordinatordashboard.css";

const sources = ["students", "attendance", "partnerCompanies"];

function CoordinatorDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(Object.fromEntries(sources.map((source) => [source, []])));
  const [loading, setLoading] = useState(true);
  const [failedSources, setFailedSources] = useState([]);

  useEffect(() => {
    const ready = new Set();
    const subscriptions = sources.map((source) => onSnapshot(
      ["students", "attendance"].includes(source)
        ? query(collection(db, source), where("coordinatorUid", "==", user.uid))
        : collection(db, source),
      (snapshot) => {
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
  }, [user.uid]);

  const students = data.students;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  const attendanceToday = data.attendance.filter((item) => item.date === today).length;
  const stats = [
    ["Assigned Students", students.length, Users, "students"],
    ["Attendance Today", attendanceToday, ClipboardCheck, "attendance"],
    ["OJT Supervisors", data.partnerCompanies.length, Building2, "partnercompanies"],
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
      </header>

      {failedSources.length > 0 && <div className="coordinator-dashboard-error" role="alert">Unable to load: {failedSources.join(", ")}. Check Firestore permissions.</div>}

      <section className="coordinator-stats" aria-label="Coordinator summary">
        {stats.map(([label, value, Icon, path]) => <button type="button" className="coordinator-stat" key={label} onClick={() => navigate(`/coordinator/${path}`)}><Icon size={20} /><span>{label}</span><strong>{value}</strong><ArrowRight size={16} /></button>)}
      </section>

      <section className="coordinator-panel coordinator-quick-actions"><h2>Quick actions</h2><div><button type="button" onClick={() => navigate("/coordinator/students")}>View students</button></div></section>
      <p className="coordinator-dashboard-note">Monitoring data is shared with the OJT management team.</p>
    </main>
  );
}

export default CoordinatorDashboard;
