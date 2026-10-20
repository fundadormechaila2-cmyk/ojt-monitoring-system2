import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { BarChart3 } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { db } from "../../services/firebase";
import { withoutArchived } from "../../services/recordState";
import { PageHeader } from "./SupervisorComponents";

function parseTime(value) {
	const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(value || "");
	if (!match) return null;
	let hour = Number(match[1]) % 12;
	if (match[3].toUpperCase() === "PM") hour += 12;
	return hour * 60 + Number(match[2]);
}

function completedHours(record) {
	const hasPeriodData = record.amIn || record.amOut || record.pmIn || record.pmOut ||
		record.morningTimeIn || record.morningTimeOut || record.afternoonTimeIn || record.afternoonTimeOut;
	const sessions = hasPeriodData
		? [
				[record.amIn || record.morningTimeIn, record.amOut || record.morningTimeOut],
				[record.pmIn || record.afternoonTimeIn, record.pmOut || record.afternoonTimeOut],
			]
		: [[record.timeIn, record.timeOut]];
	return sessions.reduce((total, [startValue, endValue]) => {
		const start = parseTime(startValue);
		const end = parseTime(endValue);
		return start !== null && end !== null && end > start ? total + (end - start) / 60 : total;
	}, 0);
}

function OJTHours() {
	const { user } = useAuth();
	const [students, setStudents] = useState([]);
	const [attendance, setAttendance] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	useEffect(() => {
		if (!user?.uid) return undefined;
		const finishLoading = { students: false, attendance: false };
		const updateLoading = () => {
			if (finishLoading.students && finishLoading.attendance) setLoading(false);
		};
		const unsubscribeStudents = onSnapshot(
			query(collection(db, "students"), where("supervisorUid", "==", user.uid)),
			(snapshot) => {
				setStudents(withoutArchived(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))));
				finishLoading.students = true;
				updateLoading();
			},
			(snapshotError) => {
				console.error("Unable to load assigned students for OJT hours:", snapshotError);
				setError("Assigned students could not be loaded.");
				finishLoading.students = true;
				updateLoading();
			},
		);
		const unsubscribeAttendance = onSnapshot(
			query(collection(db, "attendance"), where("supervisorId", "==", user.uid)),
			(snapshot) => {
				setAttendance(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
				finishLoading.attendance = true;
				updateLoading();
			},
			(snapshotError) => {
				console.error("Unable to load supervisor attendance for OJT hours:", snapshotError);
				setError("Attendance hours could not be loaded.");
				finishLoading.attendance = true;
				updateLoading();
			},
		);
		return () => {
			unsubscribeStudents();
			unsubscribeAttendance();
		};
	}, [user?.uid]);
	const progressRecords = useMemo(() => students.map((student) => {
		const hours = attendance
			.filter((record) => record.studentUid === student.studentUid || record.studentUid === student.id)
			.reduce((sum, record) => sum + completedHours(record), 0);
		const required = Number(student.requiredHours || student.totalRequiredHours || 0);
		return { ...student, hours, required, progress: required ? Math.min(100, Math.round((hours / required) * 100)) : 0 };
	}), [attendance, students]);
	const total = progressRecords.reduce((sum, student) => sum + student.hours, 0);
	const averageProgress = progressRecords.length
		? Math.round(progressRecords.reduce((sum, student) => sum + student.progress, 0) / progressRecords.length)
		: 0;
	return <div className="supervisor-page"><PageHeader title="OJT Hours" description="Track progress toward each trainee's required placement hours." />{error && <p className="supervisor-error" role="alert">{error}</p>}<section className="supervisor-kpi-row"><div className="supervisor-kpi"><span>Total tracked hours</span><strong>{loading ? "…" : total.toFixed(2)}</strong></div><div className="supervisor-kpi"><span>Required hours</span><strong>{progressRecords.reduce((sum, student) => sum + student.required, 0) || "Not set"}</strong></div><div className="supervisor-kpi"><span>Average progress</span><strong>{loading ? "…" : `${averageProgress}%`}</strong></div></section><section className="supervisor-panel"><div className="supervisor-panel-heading"><div><h2>Hours by trainee</h2><p>Current logged hours and completion progress</p></div><BarChart3 size={20} color="#9aa8ba" /></div><div className="supervisor-list">{loading ? <p className="supervisor-muted">Loading assigned student hours...</p> : progressRecords.length ? progressRecords.map((student) => <div className="supervisor-list-item" key={student.id}><div><strong>{student.name || `${student.firstName || ""} ${student.lastName || ""}`.trim() || "Unnamed student"}</strong><span>{student.company || "Not assigned"} · {student.hours.toFixed(2)} of {student.required || "—"} hours</span></div><div style={{ minWidth: "150px" }}><div style={{ height: "7px", borderRadius: "99px", background: "#e9edf3" }}><div style={{ width: `${student.progress}%`, height: "100%", borderRadius: "99px", background: "#3576d3" }} /></div><small>{student.progress}% complete</small></div></div>) : <p className="supervisor-empty">No assigned student hours available.</p>}</div></section></div>;
}

export default OJTHours;
