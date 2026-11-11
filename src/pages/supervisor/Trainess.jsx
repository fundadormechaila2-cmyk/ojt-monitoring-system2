import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  query as firestoreQuery,
  where,
} from "firebase/firestore";
import { Eye, X } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { db } from "../../services/firebase";
import { formatHoursMinutes } from "../../services/manualAttendanceService";
import { withoutArchived } from "../../services/recordState";
import { getStudentDeploymentStatus } from "../../services/studentDeploymentStatus";
import { PageHeader, SearchBox, Status } from "./SupervisorComponents";
import DepartmentBadge from "../../components/DepartmentBadge";
import "../../styles/supervisor-trainees.css";

function studentName(student) {
  return (
    student.name ||
    student.fullName ||
    `${student.firstName || ""} ${student.lastName || ""}`.trim() ||
    "Unnamed student"
  );
}

function studentValue(value) {
  return value === undefined || value === null || String(value).trim() === ""
    ? "Not provided"
    : String(value);
}

function Trainess() {
  const { user } = useAuth();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [selectedStudentId, setSelectedStudentId] = useState("");

  useEffect(() => {
    if (!user?.uid) return undefined;
    return onSnapshot(
      firestoreQuery(
        collection(db, "students"),
        where("supervisorUid", "==", user.uid),
      ),
      (snapshot) => {
        setStudents(
          withoutArchived(
            snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
          ),
        );
        setLoading(false);
        setError("");
      },
      (snapshotError) => {
        console.error("Unable to load assigned supervisor students:", snapshotError);
        setLoading(false);
        setError("Assigned students could not be loaded. Check Firestore permissions.");
      },
    );
  }, [user?.uid]);

  const studentsWithStatus = useMemo(
    () =>
      students.map((student) => {
        const deploymentStatus = getStudentDeploymentStatus(
          student,
          student.completedHours ||
            student.ojtHours ||
            student.hoursCompleted ||
            0,
          student.requiredHours ||
            student.totalRequiredHours ||
            student.ojtRequiredHours ||
            0,
        );
        return {
          ...student,
          deploymentStatus:
            deploymentStatus === "DEPLOYED" ? "ON-GOING" : deploymentStatus,
        };
      }),
    [students],
  );

  const filteredStudents = useMemo(
    () =>
      studentsWithStatus.filter((student) => {
        const matchesQuery = `${studentName(student)} ${
          student.studentId || student.id
        } ${student.company || ""}`
          .toLowerCase()
          .includes(query.trim().toLowerCase());
        return (
          matchesQuery &&
          (status === "All" || student.deploymentStatus === status)
        );
      }),
    [query, status, studentsWithStatus],
  );

  const selectedStudent =
    studentsWithStatus.find((student) => student.id === selectedStudentId) ||
    null;

  useEffect(() => {
    if (!selectedStudentId) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setSelectedStudentId("");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedStudentId]);

  return (
    <div className="supervisor-page">
      <PageHeader
        title="Student Interns"
        description="Monitor the trainees assigned to your supervision."
      />
      <section className="supervisor-panel supervisor-table-panel">
        <div className="supervisor-toolbar">
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="Search by name, ID, or company..."
          />
          <select
            className="supervisor-select"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            aria-label="Filter students by status"
          >
            <option>All</option>
            <option>NOT DEPLOYED</option>
            <option>PENDING</option>
            <option>ON-GOING</option>
            <option>COMPLETED</option>
          </select>
        </div>
        {error && (
          <p className="supervisor-error" role="alert">
            {error}
          </p>
        )}
        <div className="supervisor-table-wrap">
          <table className="supervisor-table">
            <thead>
              <tr>
                <th>Student Intern</th>
                <th>Course</th>
                <th>Company</th>
                <th>Progress</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6">Loading assigned students...</td>
                </tr>
              ) : (
                filteredStudents.map((student) => {
                  const required = Number(
                    student.requiredHours ||
                      student.totalRequiredHours ||
                      student.ojtRequiredHours ||
                      0,
                  );
                  const hours = Number(
                    student.completedHours ||
                      student.ojtHours ||
                      student.hoursCompleted ||
                      0,
                  );
                  const progress =
                    required > 0
                      ? Math.min(100, Math.round((hours / required) * 100))
                      : 0;
                  return (
                    <tr key={student.id}>
                      <td>
                        <strong>{studentName(student)}</strong>
                        <br />
                        <span>{student.studentId || student.id}</span>
                      </td>
                      <td>
                        <DepartmentBadge
                          value={
                            student.course ||
                            student.program ||
                            student.department
                          }
                        />
                      </td>
                      <td>{student.company || "—"}</td>
                      <td>
                        <strong>{progress}%</strong>
                        <br />
                        <span>{formatHoursMinutes(hours)}</span>
                      </td>
                      <td>
                        <Status value={student.deploymentStatus} />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="supervisor-action secondary"
                          title={`View details for ${studentName(student)}`}
                          aria-label={`View details for ${studentName(student)}`}
                          onClick={() => setSelectedStudentId(student.id)}
                        >
                          <Eye size={14} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          {!loading && filteredStudents.length === 0 && (
            <p className="supervisor-empty">
              No assigned student interns match your search.
            </p>
          )}
        </div>
      </section>

      {selectedStudent && (
        <div
          className="supervisor-student-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedStudentId("");
          }}
        >
          <section
            className="supervisor-student-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="supervisor-student-dialog-title"
          >
            <header className="supervisor-student-dialog-header">
              <div>
                <p>Student intern details</p>
                <h2 id="supervisor-student-dialog-title">
                  {studentName(selectedStudent)}
                </h2>
                <span>
                  {studentValue(
                    selectedStudent.studentId || selectedStudent.id,
                  )}
                </span>
              </div>
              <button
                type="button"
                className="supervisor-student-dialog-close"
                aria-label="Close student details"
                onClick={() => setSelectedStudentId("")}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </header>
            <div className="supervisor-student-dialog-content">
              <div className="supervisor-student-detail">
                <span>Course / Department</span>
                <DepartmentBadge
                  value={
                    selectedStudent.course ||
                    selectedStudent.program ||
                    selectedStudent.department
                  }
                />
              </div>
              <StudentDetail
                label="Email"
                value={selectedStudent.email}
              />
              <StudentDetail
                label="Phone"
                value={selectedStudent.phone}
              />
              <StudentDetail
                label="Company"
                value={
                  selectedStudent.company ||
                  selectedStudent.companyName ||
                  selectedStudent.partnerCompanyName
                }
              />
              <StudentDetail
                label="OJT Supervisor"
                value={
                  selectedStudent.supervisorName ||
                  selectedStudent.supervisor ||
                  user?.displayName ||
                  user?.email
                }
              />
              <StudentDetail
                label="Coordinator"
                value={selectedStudent.coordinatorName}
              />
              <StudentDetail
                label="OJT Hours"
                value={`${formatHoursMinutes(
                  selectedStudent.completedHours ||
                    selectedStudent.ojtHours ||
                    selectedStudent.hoursCompleted ||
                    0,
                )} of ${formatHoursMinutes(
                  selectedStudent.requiredHours ||
                    selectedStudent.totalRequiredHours ||
                    selectedStudent.ojtRequiredHours ||
                    0,
                )}`}
              />
              <div className="supervisor-student-detail">
                <span>Deployment Status</span>
                <Status value={selectedStudent.deploymentStatus} />
              </div>
            </div>
            <footer className="supervisor-student-dialog-footer">
              <button
                type="button"
                className="supervisor-action secondary"
                onClick={() => setSelectedStudentId("")}
              >
                Close
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}

function StudentDetail({ label, value }) {
  return (
    <div className="supervisor-student-detail">
      <span>{label}</span>
      <strong>{studentValue(value)}</strong>
    </div>
  );
}

export default Trainess;
