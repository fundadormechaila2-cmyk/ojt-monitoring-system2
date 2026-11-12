import { useState } from "react";
import { Eye, Search } from "lucide-react";
import { COURSES } from "../../constants/courses";
import { CoordinatorState, normalizedStudents, useCoordinatorData, useFilteredStudents } from "./coordinatorData.jsx";
import "../../styles/students-data.css";

function Students() {
  const { data, loading, error } = useCoordinatorData(["students", "attendance"]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All statuses");
  const [course, setCourse] = useState("All courses");
  const [selected, setSelected] = useState(null);
  const records = normalizedStudents(data.students, data.attendance);
  const visible = useFilteredStudents(records, search, { status, course });

  return <CoordinatorState loading={loading} error={error}><main className="coordinator-data-page"><header className="coordinator-data-header"><div><p>OJT management</p><h1>Students</h1><span>Live student placement and progress records.</span></div></header><section className="coordinator-data-panel"><div className="coordinator-data-toolbar"><label className="coordinator-data-search"><Search size={16} /><span className="sr-only">Search students</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, ID, course, or company" /></label><select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)}><option>All statuses</option><option>Ongoing</option><option>Pending</option><option>Completed</option></select><select aria-label="Filter by course" value={course} onChange={(event) => setCourse(event.target.value)}><option>All courses</option>{COURSES.map((item) => <option key={item}>{item}</option>)}</select></div>{visible.length === 0 ? <div className="coordinator-data-empty">No students match the selected filters.</div> : <div className="coordinator-data-table-wrap"><table className="coordinator-data-table"><thead><tr><th>Student</th><th>ID</th><th>Program</th><th>Company</th><th>Hours</th><th>Status</th><th /></tr></thead><tbody>{visible.map((student) => <tr key={student.id}><td><strong>{student.name}</strong></td><td>{student.studentId || "-"}</td><td>{student.course}</td><td>{student.company}</td><td>{student.completed} / {student.required}</td><td><span className={`coordinator-badge ${student.status.toLowerCase()}`}>{student.status}</span></td><td><button type="button" className="coordinator-icon-button" title="View student details" aria-label={`View ${student.name}`} onClick={() => setSelected(student)}><Eye size={16} /></button></td></tr>)}</tbody></table></div>}</section>{selected && <div className="coordinator-modal-backdrop" role="presentation" onClick={(event) => event.target === event.currentTarget && setSelected(null)}><section className="coordinator-modal" role="dialog" aria-modal="true"><header><h2>{selected.name}</h2><button type="button" onClick={() => setSelected(null)} aria-label="Close">×</button></header><dl><div><dt>Student ID</dt><dd>{selected.studentId || "-"}</dd></div><div><dt>Program</dt><dd>{selected.course}</dd></div><div><dt>Company</dt><dd>{selected.company}</dd></div><div><dt>OJT progress</dt><dd>{selected.completed} of {selected.required} hours ({Math.round((selected.completed / selected.required) * 100)}%)</dd></div></dl></section></div>}</main></CoordinatorState>;
}

export default Students;
