import { useEffect, useState } from "react";
import { collection, deleteField, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { Eye, Search } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { db } from "../../services/firebase";
import { CoordinatorState, normalizedStudents, useCoordinatorData, useFilteredStudents } from "./coordinatorData.jsx";
import "../../styles/students-data.css";

const studentSources = ["students", "attendance"];

function Students() {
  const { user } = useAuth();
  const { data, loading, error } = useCoordinatorData(studentSources);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All statuses");
  const [selected, setSelected] = useState(null);
  const [supervisors, setSupervisors] = useState([]);
  const [supervisorUid, setSupervisorUid] = useState("");
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [assignmentError, setAssignmentError] = useState("");
  const [assignmentNotice, setAssignmentNotice] = useState("");
  const records = normalizedStudents(data.students, data.attendance);
  const visible = useFilteredStudents(records, search, { status });

  useEffect(() => {
    if (!user?.department) return undefined;
    return onSnapshot(
      query(
        collection(db, "users"),
        where("role", "==", "supervisor"),
        where("department", "==", user.department),
      ),
      (snapshot) => setSupervisors(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
      (snapshotError) => {
        console.error("Unable to load department supervisors:", snapshotError);
        setAssignmentError("Department supervisors could not be loaded.");
      },
    );
  }, [user?.department]);

  const openStudent = (student) => {
    setSelected(student);
    setSupervisorUid(student.supervisorUid || "");
    setAssignmentError("");
    setAssignmentNotice("");
  };

  const saveSupervisorAssignment = async () => {
    if (!selected || !user?.uid) return;
    setAssignmentSaving(true);
    setAssignmentError("");
    setAssignmentNotice("");
    try {
      const selectedSupervisor = supervisors.find((s) => s.id === supervisorUid);
      const supervisorName = selectedSupervisor
        ? `${selectedSupervisor.firstName || ""} ${selectedSupervisor.lastName || ""}`.trim() ||
          selectedSupervisor.fullName ||
          selectedSupervisor.name ||
          ""
        : "";

      const changes = {
        ...(supervisorUid
          ? {
              supervisorUid,
              ...(supervisorName ? { supervisorName } : {}),
            }
          : {
              supervisorUid: deleteField(),
              supervisorName: deleteField(),
            }),
        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, "students", selected.id), changes);

      if (selected.studentUid) {
        try {
          await updateDoc(doc(db, "users", selected.studentUid), changes);
        } catch (syncError) {
          console.warn("Unable to sync supervisor assignment to student user account:", syncError);
        }
      }

      setSelected((prev) => (prev ? { ...prev, supervisorUid, supervisorName } : null));
      setAssignmentNotice(supervisorUid ? "Supervisor assignment saved." : "Supervisor assignment removed.");
    } catch (saveError) {
      console.error("Unable to save supervisor assignment:", saveError);
      setAssignmentError(
        saveError.code === "permission-denied"
          ? "The assignment could not be saved. Check Firestore permissions."
          : (saveError.message || "The assignment could not be saved. Confirm the supervisor is in your department.")
      );
    } finally {
      setAssignmentSaving(false);
    }
  };

  return (
    <CoordinatorState loading={loading} error={error}>
      <main className="coordinator-data-page">
        <header className="coordinator-data-header">
          <div><p>OJT management</p><h1>Students</h1><span>Live student placement and progress records.</span></div>
        </header>
        <section className="coordinator-data-panel">
          <div className="coordinator-data-toolbar">
            <label className="coordinator-data-search"><Search size={16} /><span className="sr-only">Search students</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, ID, course, or company" /></label>
            <select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)}><option>All statuses</option><option>DEPLOYED</option><option>PROCESSING</option><option>COMPLETED</option></select>
          </div>
          {visible.length === 0 ? <div className="coordinator-data-empty">No students match the selected filters.</div> : <div className="coordinator-data-table-wrap"><table className="coordinator-data-table"><thead><tr><th>Student</th><th>ID</th><th>Program</th><th>Company</th><th>Hours</th><th>Status</th><th /></tr></thead><tbody>{visible.map((student) => <tr key={student.id}><td><strong>{student.name}</strong></td><td>{student.studentId || "-"}</td><td>{student.course}</td><td>{student.company}</td><td>{student.completed} / {student.required}</td><td><span className={`coordinator-badge ${student.status.toLowerCase()}`}>{student.status}</span></td><td><button type="button" className="coordinator-icon-button" title="View student details" aria-label={`View ${student.name}`} onClick={() => openStudent(student)}><Eye size={16} /></button></td></tr>)}</tbody></table></div>}
        </section>
        {selected && <div className="coordinator-modal-backdrop" role="presentation" onClick={(event) => event.target === event.currentTarget && setSelected(null)}><section className="coordinator-modal" role="dialog" aria-modal="true"><header><h2>{selected.name}</h2><button type="button" onClick={() => setSelected(null)} aria-label="Close">×</button></header><dl><div><dt>Student ID</dt><dd>{selected.studentId || "-"}</dd></div><div><dt>Program</dt><dd>{selected.course}</dd></div><div><dt>Company</dt><dd>{selected.company}</dd></div><div><dt>OJT progress</dt><dd>{selected.completed} of {selected.required} hours ({Math.round((selected.completed / selected.required) * 100)}%)</dd></div></dl><div className="coordinator-assignment-control"><label htmlFor="student-supervisor-assignment">Assigned supervisor</label><select id="student-supervisor-assignment" value={supervisorUid} disabled={assignmentSaving} onChange={(event) => setSupervisorUid(event.target.value)}><option value="">Unassigned</option>{supervisors.map((supervisor) => <option key={supervisor.id} value={supervisor.id}>{`${supervisor.firstName || ""} ${supervisor.lastName || ""}`.trim() || supervisor.email || supervisor.id}</option>)}</select><button type="button" disabled={assignmentSaving} onClick={saveSupervisorAssignment}>{assignmentSaving ? "Saving..." : "Save supervisor"}</button>{assignmentError && <p role="alert">{assignmentError}</p>}{assignmentNotice && <p role="status">{assignmentNotice}</p>}</div></section></div>}
      </main>
    </CoordinatorState>
  );
}

export default Students;
