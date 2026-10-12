import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { ArrowRight, CalendarCheck, ClipboardCheck, Clock3, Users } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { PageHeader, StatCard, Status } from "./SupervisorComponents";
import { db } from "../../services/firebase";

function getLocalDate() {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Manila",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date());
}

function Dashboard() {
	const { user } = useAuth();
	const navigate = useNavigate();
	const [attendance, setAttendance] = useState([]);
	const [students, setStudents] = useState([]);
	const [attendanceError, setAttendanceError] = useState("");
	const [attendanceLoading, setAttendanceLoading] = useState(true);
	const today = useMemo(() => getLocalDate(), []);

	useEffect(() => {
		if (!user?.uid) return undefined;
		const unsubscribeAttendance = onSnapshot(
			query(
				collection(db, "attendance"),
				where("supervisorId", "==", user.uid),
				where("date", "==", today),
			),
			(snapshot) => {
			const records = snapshot.docs
				.map((document) => ({ id: document.id, ...document.data() }))
				.sort((left, right) => (right.updatedAt?.toMillis?.() || 0) - (left.updatedAt?.toMillis?.() || 0));
			setAttendance(records);
			setAttendanceLoading(false);
			setAttendanceError("");
			},
			(error) => {
			console.error("Unable to load live supervisor attendance:", error);
			setAttendanceError("Live attendance records could not be loaded. Check Firestore permissions.");
			setAttendanceLoading(false);
			},
		);
		const unsubscribeStudents = onSnapshot(
			query(collection(db, "students"), where("supervisorUid", "==", user.uid)),
			(snapshot) => setStudents(snapshot.docs.map((document) => ({ id: document.id, ...document.data() }))),
			(error) => {
				console.error("Unable to load assigned supervisor students:", error);
				setAttendanceError("Assigned student records could not be loaded. Check Firestore permissions.");
			},
		);
		return () => {
			unsubscribeAttendance();
			unsubscribeStudents();
		};
	}, [today, user?.uid]);

	const attention = students.filter((student) => student.ojtStatus === "Needs attention" || student.status === "Needs attention").length;
	const attendanceIssues = attendance.filter((record) =>
		record.status !== "Present" || !(record.timeIn || record.morningTimeIn) || !(record.timeOut || record.afternoonTimeOut)
	).length;
	const totalHours = attendance.reduce((total, record) => total + Number(record.totalHours ?? record.hours ?? 0), 0);
	return (
		<div className="supervisor-page">
			<PageHeader
				eyebrow="LCCI · Supervisor workspace"
				title="Supervisor Dashboard"
				description={`Welcome back, ${user?.firstName || user?.email || "Supervisor"}. Here is your current OJT monitoring overview.`}
			/>

			<section className="supervisor-grid" aria-label="Supervisor summary">
				<StatCard icon={Users} label="Assigned Students" value={students.length} detail="Active trainee records" />
				<StatCard icon={CalendarCheck} label="Attendance Issues" value={attendanceLoading ? "…" : attendanceIssues} detail="Incomplete records today" tone="coral" />
				<StatCard icon={Clock3} label="Today's Recorded Hours" value={attendanceLoading ? "…" : totalHours.toFixed(2)} detail="From today's attendance scans" tone="amber" />
				<StatCard icon={ClipboardCheck} label="Needs Review" value={attention} detail="Students needing follow-up" tone="teal" />
			</section>

			<section className="supervisor-dashboard-grid" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
				<article className="supervisor-panel">
					<div className="supervisor-panel-heading"><div><h2>Live attendance list</h2><p>Today's scans · {today}</p></div><button type="button" className="supervisor-action secondary" onClick={() => navigate("/supervisor/scan-student-qr")}>Scan student QR <ArrowRight size={14} /></button></div>
					{attendanceError ? <p className="supervisor-error" role="alert">{attendanceError}</p> : attendanceLoading ? <p className="supervisor-muted">Loading attendance scans...</p> : attendance.length === 0 ? <p className="supervisor-muted">No student scans recorded today.</p> : <div className="supervisor-list">{attendance.slice(0, 6).map((record) => <div className="supervisor-list-item" key={record.id}><div><strong>{record.studentName || record.student || record.studentId || "Student"}</strong><span>{record.studentId || "Student ID unavailable"} · In {record.timeIn || record.morningTimeIn || "—"} · Out {record.timeOut || record.afternoonTimeOut || "—"}</span></div><Status value={record.timeOut || record.afternoonTimeOut ? "Complete" : "Time-In"} /></div>)}</div>}
				</article>
			</section>
		</div>
	);
}

export default Dashboard;
