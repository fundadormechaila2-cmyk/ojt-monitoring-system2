import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query as firestoreQuery, where } from "firebase/firestore";
import { Eye, UserPlus } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { db } from "../../services/firebase";
import { PageHeader, SearchBox, Status } from "./SupervisorComponents";

function Trainess() {
	const { user } = useAuth();
	const [students, setStudents] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [query, setQuery] = useState("");
	const [status, setStatus] = useState("All");
	useEffect(() => {
		if (!user?.uid) return undefined;
		return onSnapshot(
			firestoreQuery(collection(db, "students"), where("supervisorUid", "==", user.uid)),
			(snapshot) => {
				setStudents(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
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
	const filteredStudents = useMemo(() => students.filter((student) => {
		const name = student.name || `${student.firstName || ""} ${student.lastName || ""}`.trim();
		const matchesQuery = `${name} ${student.studentId || student.id} ${student.company || ""}`.toLowerCase().includes(query.toLowerCase());
		return matchesQuery && (status === "All" || student.ojtStatus === status || student.status === status);
	}), [query, status, students]);

	return <div className="supervisor-page"><PageHeader title="Student Interns" description="Monitor the trainees assigned to your supervision." action={<button type="button" className="supervisor-primary" disabled><UserPlus size={16} /> Add student intern</button>} /><section className="supervisor-panel supervisor-table-panel"><div className="supervisor-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Search by name, ID, or company..." /><select className="supervisor-select" value={status} onChange={(event) => setStatus(event.target.value)}><option>All</option><option>On OJT</option><option>Completed</option><option>Needs attention</option></select></div>{error && <p className="supervisor-error" role="alert">{error}</p>}<div className="supervisor-table-wrap"><table className="supervisor-table"><thead><tr><th>Student Intern</th><th>Course</th><th>Company</th><th>Progress</th><th>Status</th><th>Action</th></tr></thead><tbody>{loading ? <tr><td colSpan="6">Loading assigned students...</td></tr> : filteredStudents.map((student) => { const name = student.name || `${student.firstName || ""} ${student.lastName || ""}`.trim(); const required = Number(student.requiredHours || 0); const hours = Number(student.completedHours || 0); const progress = required > 0 ? Math.min(100, Math.round((hours / required) * 100)) : 0; const studentStatus = student.ojtStatus || student.status || "PROCESSING"; return <tr key={student.id}><td><strong>{name || "Unnamed student"}</strong><br /><span>{student.studentId || student.id}</span></td><td>{student.course || student.program || "—"}</td><td>{student.company || "—"}</td><td><strong>{progress}%</strong><br /><span>{hours} hours</span></td><td><Status value={studentStatus} /></td><td><button type="button" className="supervisor-action secondary" title="Student details" aria-label={`Student ${name || student.id}`}><Eye size={14} /></button></td></tr>; })}</tbody></table>{!loading && filteredStudents.length === 0 && <p className="supervisor-empty">No assigned student interns match your search.</p>}</div></section></div>;
}

export default Trainess;
