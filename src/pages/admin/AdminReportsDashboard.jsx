import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileText,
  Search,
  UserRoundCog,
  Users,
} from "lucide-react";
import { collection, onSnapshot } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { db } from "../../services/firebase";
import { withoutArchived } from "../../services/recordState";
import "../../styles/coordinatordashboard.css";

const sources = [
  "students",
  "applications",
  "attendance",
  "partnerCompanies",
  "evaluations",
  "users",
];
const statuses = ["All statuses", "Ongoing", "Completed", "Pending"];

function valueOf(record, keys, fallback = "") {
  return (
    keys
      .map((key) => record[key])
      .find((value) => value !== undefined && value !== null && value !== "") ??
    fallback
  );
}

function dateValue(value) {
  if (!value) return "";
  if (typeof value.toDate === "function")
    return value.toDate().toISOString().slice(0, 10);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function studentIdOf(record) {
  return valueOf(record, ["studentId", "studentID", "idNumber", "id"], "");
}

function studentNameOf(record) {
  return valueOf(
    record,
    ["name", "fullName", "studentName", "student"],
    `${record.firstName || ""} ${record.lastName || ""}`.trim() ||
      "Unnamed student",
  );
}

function normalizeStudent(record, attendance) {
  const studentId = studentIdOf(record);
  const attendanceHours = attendance
    .filter((item) => studentIdOf(item) === studentId)
    .reduce(
      (sum, item) => sum + Number(valueOf(item, ["totalHours", "hours"], 0)),
      0,
    );
  const storedHours = Number(
    valueOf(
      record,
      ["completedHours", "ojtHours", "hoursCompleted", "hours"],
      0,
    ),
  );
  const hours = storedHours || attendanceHours;
  const required = Number(
    valueOf(
      record,
      ["requiredHours", "totalRequiredHours", "ojtRequiredHours"],
      500,
    ),
  );
  const rawStatus = String(
    valueOf(record, ["ojtStatus", "status", "placementStatus"], ""),
  ).toLowerCase();
  const status =
    rawStatus.includes("complete") || (required > 0 && hours >= required)
      ? "Completed"
      : rawStatus.includes("pending") || rawStatus.includes("not started")
        ? "Pending"
        : "Ongoing";

  return {
    id: record.id,
    studentId,
    name: studentNameOf(record),
    course: valueOf(
      record,
      ["course", "program", "courseProgram"],
      "Not specified",
    ),
    company: valueOf(
      record,
      ["company", "partnerCompany", "companyName"],
      "Not assigned",
    ),
    startDate: dateValue(
      valueOf(record, ["startDate", "ojtStartDate", "deploymentDate"]),
    ),
    hours,
    required,
    status,
  };
}

function AdminReportsDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(
    Object.fromEntries(sources.map((source) => [source, []])),
  );
  const [loading, setLoading] = useState(true);
  const [failedSources, setFailedSources] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All statuses");
  const [year, setYear] = useState("All years");

  useEffect(() => {
    const ready = new Set();
    const subscriptions = sources.map((source) =>
      onSnapshot(
        collection(db, source),
        (snapshot) => {
          setData((current) => ({
            ...current,
            [source]: withoutArchived(snapshot.docs.map((item) => ({
              id: item.id,
              ...item.data(),
            }))),
          }));
          setFailedSources((current) =>
            current.filter((item) => item !== source),
          );
          ready.add(source);
          if (ready.size === sources.length) setLoading(false);
        },
        (error) => {
          console.error(`Unable to load admin reports ${source}:`, error);
          setFailedSources((current) =>
            current.includes(source) ? current : [...current, source],
          );
          ready.add(source);
          if (ready.size === sources.length) setLoading(false);
        },
      ),
    );

    return () => subscriptions.forEach((unsubscribe) => unsubscribe());
  }, []);

  const students = useMemo(
    () =>
      data.students.map((student) =>
        normalizeStudent(student, data.attendance),
      ),
    [data.attendance, data.students],
  );
  const years = useMemo(
    () => [
      "All years",
      ...new Set(
        students
          .map((student) => student.startDate.slice(0, 4))
          .filter(Boolean),
      ),
    ],
    [students],
  );
  const filteredStudents = useMemo(
    () =>
      students.filter((student) => {
        const query = search.trim().toLowerCase();
        return (
          (!query ||
            `${student.name} ${student.studentId} ${student.course} ${student.company}`
              .toLowerCase()
              .includes(query)) &&
          (status === "All statuses" || student.status === status) &&
          (year === "All years" || student.startDate.startsWith(year))
        );
      }),
    [search, status, students, year],
  );
  const pendingApplications = data.applications.filter(
    (item) => String(item.status || "").toLowerCase() === "pending",
  );
  const attendanceIssues = data.attendance.filter((item) =>
    ["absent", "late", "incomplete"].includes(
      String(item.status || "").toLowerCase(),
    ),
  );
  const completedEvaluations = data.evaluations.filter(
    (item) => String(item.status || "").toLowerCase() === "completed",
  );
  const pendingEvaluations = data.evaluations.filter(
    (item) => String(item.status || "").toLowerCase() === "pending",
  );
  const coordinators = data.users.filter(
    (item) => String(item.role || "").toLowerCase() === "coordinator",
  );
  const totalHours = data.attendance.reduce(
    (sum, item) => sum + Number(valueOf(item, ["totalHours", "hours"], 0)),
    0,
  );
  const clearFilters = () => {
    setSearch("");
    setStatus("All statuses");
    setYear("All years");
  };

  if (loading)
    return (
      <main className="coordinator-dashboard coordinator-dashboard-state">
        Loading admin reports dashboard...
      </main>
    );

  return (
    <main className="coordinator-dashboard">
      <header className="coordinator-dashboard-header">
        <div>
          <p className="dashboard-eyebrow">LCCI · OJT monitoring system</p>
          <h1>Admin Reports Dashboard</h1>
          <p>
            Review live student progress, applications, attendance, hours, and
            evaluations in one place.
          </p>
        </div>
        <button
          type="button"
          className="coordinator-primary-action"
          onClick={() => navigate("/admin/ojtreports")}
        >
          <BarChart3 size={16} /> Open OJT reports
        </button>
      </header>

      {failedSources.length > 0 && (
        <div className="coordinator-dashboard-error" role="alert">
          Unable to load: {failedSources.join(", ")}. Check Firestore
          permissions.
        </div>
      )}

      <section className="coordinator-stats" aria-label="Admin reports summary">
        <button
          type="button"
          className="coordinator-stat"
          onClick={() => navigate("/admin/students")}
        >
          <Users size={20} />
          <span>Total Students</span>
          <strong>{students.length}</strong>
          <ArrowRight size={16} />
        </button>
        <button
          type="button"
          className="coordinator-stat"
          onClick={() => navigate("/admin/application")}
        >
          <FileText size={20} />
          <span>Pending Applications</span>
          <strong>{pendingApplications.length}</strong>
          <ArrowRight size={16} />
        </button>
        <button
          type="button"
          className="coordinator-stat"
          onClick={() => navigate("/admin/attendancereports")}
        >
          <AlertTriangle size={20} />
          <span>Attendance Issues</span>
          <strong>{attendanceIssues.length}</strong>
          <ArrowRight size={16} />
        </button>
        <button
          type="button"
          className="coordinator-stat"
          onClick={() => navigate("/admin/evaluation")}
        >
          <CheckCircle2 size={20} />
          <span>Completed Evaluations</span>
          <strong>{completedEvaluations.length}</strong>
          <ArrowRight size={16} />
        </button>
        <button
          type="button"
          className="coordinator-stat"
          onClick={() => navigate("/admin/partnercompanies")}
        >
          <Building2 size={20} />
          <span>OJT Supervisors</span>
          <strong>{data.partnerCompanies.length}</strong>
          <ArrowRight size={16} />
        </button>
        <button
          type="button"
          className="coordinator-stat"
          onClick={() => navigate("/admin/ojthours")}
        >
          <Clock3 size={20} />
          <span>Total OJT Hours</span>
          <strong>{totalHours.toLocaleString()}</strong>
          <ArrowRight size={16} />
        </button>
        <button
          type="button"
          className="coordinator-stat"
          onClick={() => navigate("/admin/attendancereports")}
        >
          <ClipboardCheck size={20} />
          <span>Attendance Records</span>
          <strong>{data.attendance.length}</strong>
          <ArrowRight size={16} />
        </button>
        <button
          type="button"
          className="coordinator-stat"
          onClick={() => navigate("/admin/evaluation")}
        >
          <Clock3 size={20} />
          <span>Pending Evaluations</span>
          <strong>{pendingEvaluations.length}</strong>
          <ArrowRight size={16} />
        </button>
        <button
          type="button"
          className="coordinator-stat"
          onClick={() => navigate("/admin/ojtcoordinators")}
        >
          <UserRoundCog size={20} />
          <span>OJT Coordinators</span>
          <strong>{coordinators.length}</strong>
          <ArrowRight size={16} />
        </button>
      </section>

      <section className="coordinator-dashboard-grid">
        <article className="coordinator-panel">
          <div className="coordinator-panel-heading">
            <h2>OJT progress overview</h2>
            <button type="button" onClick={() => navigate("/admin/ojtreports")}>
              View report <ArrowRight size={15} />
            </button>
          </div>
          <div className="coordinator-report-progress">
            <div>
              <strong>
                {
                  students.filter((student) => student.status === "Ongoing")
                    .length
                }
              </strong>
              <span>Currently on OJT</span>
            </div>
            <div>
              <strong>
                {
                  students.filter((student) => student.status === "Completed")
                    .length
                }
              </strong>
              <span>Completed OJT</span>
            </div>
            <div>
              <strong>{totalHours.toLocaleString()}</strong>
              <span>Attendance hours</span>
            </div>
          </div>
        </article>
        <article className="coordinator-panel">
          <div className="coordinator-panel-heading">
            <h2>Report shortcuts</h2>
          </div>
          <div className="coordinator-quick-actions">
            <div>
              <button
                type="button"
                onClick={() => navigate("/admin/application")}
              >
                <FileText size={15} /> Applications
              </button>
              <button
                type="button"
                onClick={() => navigate("/admin/attendancereports")}
              >
                <ClipboardCheck size={15} /> Attendance reports
              </button>
              <button
                type="button"
                onClick={() => navigate("/admin/ojtreports")}
              >
                <BarChart3 size={15} /> OJT reports
              </button>
              <button type="button" onClick={() => navigate("/admin/ojthours")}>
                <Clock3 size={15} /> OJT hours
              </button>
              <button
                type="button"
                onClick={() => navigate("/admin/evaluation")}
              >
                <CheckCircle2 size={15} /> Evaluations
              </button>
              <button
                type="button"
                onClick={() => navigate("/admin/partnercompanies")}
              >
                <Building2 size={15} /> Companies
              </button>
            </div>
          </div>
        </article>
      </section>

      <section className="coordinator-panel admin-reports-table-panel">
        <div className="coordinator-panel-heading">
          <div>
            <h2>Student reports</h2>
            <p className="admin-reports-muted">
              Filter by student, course, company, status, or start year.
            </p>
          </div>
          <button type="button" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
        <div className="admin-reports-filters">
          <label className="admin-reports-search">
            <Search size={15} />
            <span className="sr-only">Search student reports</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search student, ID, course, or company"
            />
          </label>
          <select
            aria-label="Filter student reports by status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {statuses.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            aria-label="Filter student reports by year"
            value={year}
            onChange={(event) => setYear(event.target.value)}
          >
            {years.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>
        <div className="admin-reports-table-wrap">
          <table className="admin-reports-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Course</th>
                <th>Company</th>
                <th>OJT Hours</th>
                <th>Start Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((student) => (
                <tr key={student.id}>
                  <td>
                    <strong>{student.name}</strong>
                    <small>{student.studentId || "No student ID"}</small>
                  </td>
                  <td>{student.course}</td>
                  <td>{student.company}</td>
                  <td>
                    {student.hours} / {student.required}
                  </td>
                  <td>{student.startDate || "—"}</td>
                  <td>
                    <span
                      className={`admin-reports-status ${student.status.toLowerCase()}`}
                    >
                      {student.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredStudents.length === 0 && (
            <p className="coordinator-empty">
              No student reports match the current filters.
            </p>
          )}
        </div>
        <p className="admin-reports-muted">
          Showing {filteredStudents.length} of {students.length} student
          reports.
        </p>
      </section>

      <section className="coordinator-panel admin-reports-table-panel">
        <div className="coordinator-panel-heading">
          <div>
            <h2>Evaluation reports</h2>
            <p className="admin-reports-muted">
              Live evaluation records from Firestore.
            </p>
          </div>
          <button type="button" onClick={() => navigate("/admin/evaluation")}>
            View evaluations <ArrowRight size={15} />
          </button>
        </div>
        {data.evaluations.length === 0 ? (
          <p className="coordinator-empty">No evaluation records found.</p>
        ) : (
          <div className="admin-reports-table-wrap">
            <table className="admin-reports-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Company</th>
                  <th>Evaluator</th>
                  <th>Date</th>
                  <th>Rating</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.evaluations
                  .slice(-5)
                  .reverse()
                  .map((evaluation) => (
                    <tr key={evaluation.id}>
                      <td>
                        <strong>
                          {valueOf(
                            evaluation,
                            ["studentName", "student", "name"],
                            "Unnamed student",
                          )}
                        </strong>
                        <small>
                          {valueOf(
                            evaluation,
                            ["studentId", "studentID"],
                            "No student ID",
                          )}
                        </small>
                      </td>
                      <td>
                        {valueOf(
                          evaluation,
                          ["company", "partnerCompany", "companyName"],
                          "Not assigned",
                        )}
                      </td>
                      <td>
                        {valueOf(
                          evaluation,
                          ["evaluator", "evaluatorName"],
                          "Not recorded",
                        )}
                      </td>
                      <td>
                        {dateValue(
                          valueOf(evaluation, [
                            "date",
                            "evaluationDate",
                            "createdAt",
                          ]),
                        ) || "—"}
                      </td>
                      <td>
                        {Number(
                          valueOf(evaluation, ["rating", "overallRating"], 0),
                        ) || "Not rated"}
                      </td>
                      <td>
                        <span className="admin-reports-status">
                          {valueOf(evaluation, ["status"], "Pending")}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="coordinator-dashboard-grid">
        <article className="coordinator-panel">
          <div className="coordinator-panel-heading">
            <h2>Recent applications</h2>
            <button
              type="button"
              onClick={() => navigate("/admin/application")}
            >
              View all <ArrowRight size={15} />
            </button>
          </div>
          {data.applications.length === 0 ? (
            <p className="coordinator-empty">No applications found.</p>
          ) : (
            <div className="coordinator-list">
              {data.applications
                .slice(-5)
                .reverse()
                .map((item) => (
                  <div className="coordinator-list-item" key={item.id}>
                    <div>
                      <strong>
                        {valueOf(
                          item,
                          ["studentName", "student", "name"],
                          "Unnamed student",
                        )}
                      </strong>
                      <span>
                        {valueOf(
                          item,
                          ["company", "partnerCompany", "companyName"],
                          "Company not assigned",
                        )}
                      </span>
                    </div>
                    <span className="coordinator-status">
                      {valueOf(item, ["status"], "Pending")}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </article>
        <article className="coordinator-panel">
          <div className="coordinator-panel-heading">
            <h2>Attendance status</h2>
            <button
              type="button"
              onClick={() => navigate("/admin/attendancereports")}
            >
              Review <ArrowRight size={15} />
            </button>
          </div>
          <div className="coordinator-report-progress">
            <div>
              <strong>
                {
                  data.attendance.filter(
                    (item) => String(item.status).toLowerCase() === "present",
                  ).length
                }
              </strong>
              <span>Present</span>
            </div>
            <div>
              <strong>
                {
                  data.attendance.filter(
                    (item) => String(item.status).toLowerCase() === "late",
                  ).length
                }
              </strong>
              <span>Late</span>
            </div>
            <div>
              <strong>
                {
                  data.attendance.filter(
                    (item) => String(item.status).toLowerCase() === "absent",
                  ).length
                }
              </strong>
              <span>Absent</span>
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}

export default AdminReportsDashboard;
