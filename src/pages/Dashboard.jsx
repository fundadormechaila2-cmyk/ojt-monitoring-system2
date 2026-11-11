import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ClipboardClock,
  FileText,
  Settings,
  UserRoundCog,
  Users,
} from "lucide-react";
import { db } from "../services/firebase";
import {
  getRecordPeriods,
  summarizeAttendance,
} from "../services/manualAttendanceService";
import { isAccountLive } from "../services/recordState";
import { useAuth } from "../context/useAuth";
import "../styles/admin-dashboard.css";

const collectionNames = [
  "students",
  "users",
  "attendance",
];

function valueOf(record, keys, fallback = "") {
  return (
    keys
      .map((key) => record?.[key])
      .find((value) => value !== undefined && value !== null && value !== "") ??
    fallback
  );
}

function normalizedText(value) {
  return String(value || "").trim().toLowerCase();
}

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function recordHours(record) {
  const storedHours = asNumber(valueOf(record, ["totalHours", "hours"], 0));
  if (storedHours) return storedHours;
  return summarizeAttendance(getRecordPeriods(record)).totalHours;
}

function identityKeys(record, includeDocumentId = false) {
  return [
    record.studentUid,
    record.userUid,
    record.studentRecordId,
    record.studentDocId,
    record.studentId,
    record.studentID,
    record.idNumber,
    record.email,
    includeDocumentId ? record.id : null,
  ]
    .map(normalizedText)
    .filter(Boolean);
}

function attendanceBelongsToStudent(record, student) {
  const studentKeys = new Set(identityKeys(student, true));
  return identityKeys(record).some((key) => studentKeys.has(key));
}

function studentHours(student, attendance) {
  const storedHours = asNumber(
    valueOf(
      student,
      ["completedHours", "ojtHours", "hoursCompleted", "hours"],
      0,
    ),
  );
  if (storedHours) return storedHours;

  return attendance
    .filter((record) => attendanceBelongsToStudent(record, student))
    .reduce((total, record) => total + recordHours(record), 0);
}

function requiredHours(student) {
  const value = valueOf(
    student,
    ["requiredHours", "totalRequiredHours", "ojtRequiredHours"],
    null,
  );
  const hours = Number(value);
  return Number.isFinite(hours) && hours > 0 ? hours : null;
}

function getOjtStatus(student, hours, required) {
  const statuses = [
    student.ojtStatus,
    student.deploymentStatus,
    student.placementStatus,
    student.status,
  ]
    .filter((status) => status !== undefined && status !== null)
    .map(normalizedText);
  const isCompleted = (status) =>
    status.includes("complete") &&
    !status.includes("incomplete") &&
    !status.includes("not complete");

  if (statuses.some(isCompleted) || (required && hours >= required)) {
    return "Completed";
  }
  if (
    statuses.some(
      (status) =>
        status.includes("deployed") ||
        status.includes("ongoing") ||
        status.includes("in progress") ||
        status.includes("on ojt") ||
        status === "active",
    ) ||
    Boolean(valueOf(student, ["company", "partnerCompany", "companyName"], "")) ||
    Boolean(student.supervisorUid)
  ) {
    return "Ongoing";
  }
  return "Pending";
}

function hasCompanyAssignment(student) {
  const company = normalizedText(
    valueOf(student, ["company", "partnerCompany", "companyName"], ""),
  );
  return Boolean(
    company &&
      !["not assigned", "unassigned", "none", "n/a"].includes(company),
  ) || Boolean(student.partnerCompanyId);
}

function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState({
    students: [],
    users: [],
    attendance: [],
  });
  const [ready, setReady] = useState({});
  const [sourceErrors, setSourceErrors] = useState({});

  useEffect(() => {
    let active = true;
    const unsubscribers = collectionNames.map((name) => {
      const source =
        name === "users"
          ? query(collection(db, name), where("role", "==", "coordinator"))
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
              .filter((record) =>
                name === "attendance" ? record.isArchived !== true : isAccountLive(record),
              ),
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
      data.students.map((student) => {
        const hours = studentHours(student, data.attendance);
        const required = requiredHours(student);
        return {
          ...student,
          hours,
          required,
          status: getOjtStatus(student, hours, required),
        };
      }),
    [data.attendance, data.students],
  );

  const completedStudents = students.filter(
    (student) => student.status === "Completed",
  );
  const ongoingStudents = students.filter(
    (student) => student.status === "Ongoing",
  );
  const notAssignedStudents = students.filter(
    (student) => !hasCompanyAssignment(student),
  );
  const loading = collectionNames.some((name) => !ready[name]);
  const hasSourceErrors = Object.keys(sourceErrors).length > 0;
  const go = (path) => navigate(`/admin/${path}`);
  const coordinatorCount = data.users.length;
  const studentCount = students.length;
  const getUnavailableValue = (source, value) =>
    sourceErrors[source] ||
    (source === "ojtHours" &&
      (sourceErrors.students || sourceErrors.attendance))
      ? "—"
      : value.toLocaleString();
  const fullName = String(
    valueOf(
      user,
      ["firstName", "displayName", "name", "fullName", "email"],
      "Admin",
    ),
  ).trim();
  const firstName = fullName.includes("@")
    ? fullName.split("@")[0]
    : fullName.split(/\s+/)[0] || "Admin";

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

  const stats = [
    [
      "Total Students",
      studentCount,
      "All student records",
      Users,
      "blue",
      "students",
      "students",
    ],
    [
      "Total OJT Coordinators",
      coordinatorCount,
      "Coordinator profiles",
      UserRoundCog,
      "amber",
      "ojtcoordinators",
      "users",
    ],
    [
      "Students Currently on OJT",
      ongoingStudents.length,
      "Ongoing placements",
      ClipboardClock,
      "blue",
      "students",
      "students",
    ],
    [
      "Completed OJT",
      completedStudents.length,
      "Completed placements",
      CheckCircle2,
      "teal",
      "students",
      "students",
    ],
  ];

  return (
    <div className="admin-dashboard">
      <section className="dashboard-intro dashboard-hero">
        <div>
          <p className="dashboard-eyebrow">LCCI • OJT monitoring system</p>
          <h1>Admin Dashboard</h1>
          <p className="dashboard-subtitle">
            Welcome back, {firstName}! Here is your live placement overview.
          </p>
        </div>
      </section>

      <div className="dashboard-date-button" aria-label="Today's date">
        <CalendarDays size={18} />
        <span>
          {new Date().toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </span>
      </div>

      {hasSourceErrors && (
        <div className="dashboard-error" role="alert">
          Some dashboard data is unavailable ({Object.keys(sourceErrors).join(", ")}).
          Check the connection or permissions. Unavailable figures are marked with
          an em dash.
        </div>
      )}

      <section className="dashboard-stats" aria-label="OJT summary">
        {stats.map(([label, value, detail, Icon, tone, path, source]) => (
          <button
            type="button"
            className="dashboard-stat"
            key={label}
            onClick={() => go(path)}
            aria-label={`${label}: ${sourceErrors[source] ? "unavailable" : value.toLocaleString()}. Open ${path}`}
          >
            <div className={`stat-icon stat-icon-${tone}`}>
              <Icon size={19} />
            </div>
            <div className="stat-copy">
              <p>{label}</p>
              <strong>{getUnavailableValue(source, value)}</strong>
              <span>{detail}</span>
            </div>
            <ArrowUpRight className="stat-arrow" size={17} />
          </button>
        ))}
      </section>

      <section className="dashboard-panel dashboard-student-panel">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">Student statistics</p>
            <h2>Placement snapshot</h2>
          </div>
          <Users size={20} aria-hidden="true" />
        </div>
        <div className="student-statistics">
          {[
            ["Total Students", studentCount],
            ["Active OJT Students", ongoingStudents.length],
            ["Completed Students", completedStudents.length],
            ["Students Not Yet Assigned", notAssignedStudents.length],
          ].map(([label, value]) => (
            <div className="student-statistic" key={label}>
              <span>{label}</span>
              <strong>{getUnavailableValue("students", value)}</strong>
            </div>
          ))}
        </div>
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
