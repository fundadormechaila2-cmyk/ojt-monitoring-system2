import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ClipboardClock,
  FileText,
  Settings,
  UserRound,
  UserRoundCog,
  Users,
} from "lucide-react";
import { db } from "../services/firebase";
import { isAccountLive } from "../services/recordState";
import { useAuth } from "../context/useAuth";
import "../styles/admin-dashboard.css";

const collectionNames = ["students", "users"];

function valueOf(record, keys, fallback = "") {
  return (
    keys
      .map((key) => record?.[key])
      .find((value) => value !== undefined && value !== null && value !== "") ??
    fallback
  );
}

function getOjtStatus(student) {
  const ojtStatuses = [
    student.ojtStatus,
    student.deploymentStatus,
    student.placementStatus,
  ]
    .filter((status) => status !== undefined && status !== null)
    .map((status) => String(status).trim().toLowerCase());
  const statuses = ojtStatuses.length
    ? ojtStatuses
    : [student.status]
        .filter((status) => status !== undefined && status !== null)
        .map((status) => String(status).trim().toLowerCase());
  const isCompleted = (status) =>
    status.includes("complete") &&
    !status.includes("incomplete") &&
    !status.includes("not complete");

  if (statuses.some(isCompleted)) return "Completed";
  if (
    statuses.some(
      (status) =>
        status.includes("deployed") ||
        status.includes("ongoing") ||
        status.includes("in progress") ||
        status.includes("on ojt") ||
        status === "active",
    )
  ) {
    return "Ongoing";
  }
  return "Pending";
}

function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState({ students: [], users: [] });
  const [ready, setReady] = useState({});
  const [sourceErrors, setSourceErrors] = useState({});

  useEffect(() => {
    let active = true;
    const unsubscribers = collectionNames.map((name) => {
      const source =
        name === "users"
          ? query(
              collection(db, name),
              where("role", "==", "coordinator"),
            )
          : collection(db, name);

      return onSnapshot(
        source,
        (snapshot) => {
          if (!active) return;
          setData((current) => ({
            ...current,
            [name]: snapshot.docs
              .map((document) => ({
                id: document.id,
                ...document.data(),
              }))
              .filter(isAccountLive),
          }));
          setReady((current) => ({ ...current, [name]: true }));
          setSourceErrors((current) => {
            const next = { ...current };
            delete next[name];
            return next;
          });
        },
        (error) => {
          console.error(`Unable to load dashboard ${name}:`, error);
          if (!active) return;
          setReady((current) => ({ ...current, [name]: true }));
          setSourceErrors((current) => ({
            ...current,
            [name]: "Data could not be loaded.",
          }));
        },
      );
    });

    return () => {
      active = false;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  const students = useMemo(
    () =>
      data.students.map((student) => ({
        ...student,
        status: getOjtStatus(student),
      })),
    [data.students],
  );

  const hasSourceErrors = Object.keys(sourceErrors).length > 0;
  const coordinators = data.users;
  const completedStudents = students.filter(
    (student) => student.status === "Completed",
  );
  const ongoingStudents = students.filter(
    (student) => student.status === "Ongoing",
  );
  const pendingStudents = students.filter(
    (student) => student.status === "Pending",
  );
  const completedPercent = students.length
    ? Math.round((completedStudents.length / students.length) * 100)
    : 0;

  const stats = [
    ["Total Students", students.length, "All student records", Users, "blue", "students"],
    ["OJT Coordinators", coordinators.length, "Coordinator profiles", UserRoundCog, "amber", "ojtcoordinators"],
    ["Students Currently on OJT", ongoingStudents.length, "Ongoing placements", ClipboardClock, "blue", "students"],
    ["Completed OJT", completedStudents.length, "OJT status completed", CheckCircle2, "teal", "students"],
  ];
  const loading = collectionNames.some((name) => !ready[name]);
  const go = (path) => navigate(`/admin/${path}`);
  const attentionStudents = pendingStudents.slice(0, 5);

  if (user?.role !== "admin") {
    return (
      <div className="admin-dashboard dashboard-state" role="alert">
        Admin access is required to view this dashboard.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="admin-dashboard dashboard-state" role="status">
        Loading dashboard data...
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      <section className="dashboard-intro">
        <div>
          <p className="dashboard-eyebrow">LCCI · OJT monitoring system</p>
          <h1>Admin Dashboard</h1>
          <p className="dashboard-subtitle">
            Welcome back, {user?.firstName || user?.email || "Admin"}. Here is
            your live placement overview.
          </p>
        </div>
        <div className="dashboard-date-button" aria-label="Today's date">
          <CalendarDays size={16} />
          {new Date().toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </div>
      </section>

      {hasSourceErrors && (
        <div className="dashboard-error" role="alert">
          Some dashboard data is unavailable ({Object.keys(sourceErrors).join(", ")}).
          Check the connection or permissions. Available figures may be partial.
        </div>
      )}

      <section className="dashboard-stats" aria-label="OJT summary">
        {stats.map(([label, value, detail, Icon, tone, path]) => {
          const isUnavailable = Boolean(
            sourceErrors[label === "OJT Coordinators" ? "users" : "students"],
          );

          return (
            <button
              type="button"
              className="dashboard-stat"
              key={label}
              onClick={() => go(path)}
              aria-label={`${label}: ${isUnavailable ? "unavailable" : value}. Open ${path}`}
            >
              <div className={`stat-icon stat-icon-${tone}`}>
                <Icon size={19} />
              </div>
              <div className="stat-copy">
                <p>{label}</p>
                <strong>{isUnavailable ? "—" : value.toLocaleString()}</strong>
                <span>{detail}</span>
              </div>
              <ArrowUpRight className="stat-arrow" size={17} />
            </button>
          );
        })}
      </section>

      <section className="dashboard-overview-grid" aria-label="Placement overview">
        <article className="dashboard-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Student progress</p>
              <h2>OJT placement overview</h2>
            </div>
            <ClipboardClock size={20} aria-hidden="true" />
          </div>
          {sourceErrors.students ? (
            <p className="dashboard-panel-message">
              Progress data is unavailable until student records load.
            </p>
          ) : (
            <>
              <div className="progress-layout">
                <div
                  className="progress-ring"
                  style={{ "--progress": `${completedPercent}%` }}
                  role="img"
                  aria-label={`${completedPercent}% of students have completed OJT`}
                >
                  <div>
                    <strong>{completedPercent}%</strong>
                    <span>completed</span>
                  </div>
                </div>
                <div className="progress-legend">
                  <div>
                    <span className="legend-dot legend-blue" />
                    <p>Currently on OJT <strong>{ongoingStudents.length}</strong></p>
                  </div>
                  <div>
                    <span className="legend-dot legend-teal" />
                    <p>Completed <strong>{completedStudents.length}</strong></p>
                  </div>
                  <div>
                    <span className="legend-dot legend-muted" />
                    <p>Not yet deployed <strong>{pendingStudents.length}</strong></p>
                  </div>
                </div>
              </div>
              <p className="progress-footnote">
                Based on {students.length.toLocaleString()} student
                {students.length === 1 ? "" : "s"} with records.
              </p>
            </>
          )}
        </article>

        <article className="dashboard-panel dashboard-attention-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Follow-up</p>
              <h2>Students not yet deployed</h2>
            </div>
            <span className="attention-count">
              {sourceErrors.students ? "—" : pendingStudents.length}
            </span>
          </div>
          {sourceErrors.students ? (
            <p className="dashboard-panel-message">
              Student records could not be loaded.
            </p>
          ) : attentionStudents.length ? (
            <div className="attention-list">
              {attentionStudents.map((student) => {
                const name = valueOf(
                  student,
                  ["name", "fullName", "studentName"],
                  `${student.firstName || ""} ${student.lastName || ""}`.trim() ||
                    "Unnamed student",
                );
                const identifier = valueOf(
                  student,
                  ["studentId", "studentID", "idNumber"],
                  student.id,
                );

                return (
                  <div className="attention-item" key={student.id}>
                    <div className="attention-student">
                      <span className="attention-avatar" aria-hidden="true">
                        <UserRound size={16} />
                      </span>
                      <div>
                        <strong title={name}>{name}</strong>
                        <p title={identifier}>{identifier}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => go("students")}
                      aria-label={`View ${name} in student records`}
                    >
                      <ArrowRight size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="dashboard-empty">
              {students.length
                ? "All students have an active or completed placement."
                : "No student records yet."}
            </p>
          )}
          <button
            type="button"
            className="dashboard-panel-link"
            onClick={() => go("students")}
          >
            View all students <ArrowRight size={15} />
          </button>
        </article>
      </section>

      <section className="dashboard-panel dashboard-actions-panel">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">Quick access</p>
            <h2>Admin tools</h2>
          </div>
        </div>
        <div className="dashboard-actions">
          <button
            type="button"
            className="dashboard-action"
            onClick={() => go("students")}
          >
            <Users size={16} /> Manage students
          </button>
          <button
            type="button"
            className="dashboard-action"
            onClick={() => go("ojtcoordinators")}
          >
            <UserRoundCog size={16} /> Manage coordinators
          </button>
          <button
            type="button"
            className="dashboard-action"
            onClick={() => go("reports-dashboard")}
          >
            <FileText size={16} /> View reports
          </button>
          <button
            type="button"
            className="dashboard-action"
            onClick={() => go("settings")}
          >
            <Settings size={16} /> Settings
          </button>
        </div>
      </section>
    </div>
  );
}

export default Dashboard;
