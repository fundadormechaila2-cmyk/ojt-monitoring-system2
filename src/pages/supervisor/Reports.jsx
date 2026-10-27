import { Download, FileText } from "lucide-react";
import { PageHeader, Status } from "./SupervisorComponents";
import { students } from "./SupervisorData";

function Reports() {
	const reports = students.map((student, index) => ({ student: student.name, title: `${student.company} weekly report`, submitted: index < 3, date: `Sep ${18 - index}, 2026` }));
	return <div className="supervisor-page"><PageHeader title="My Journal" description="Review weekly reports submitted by your assigned trainees." action={<button type="button" className="supervisor-primary"><Download size={16} /> Export report</button>} /><section className="supervisor-panel supervisor-table-panel"><div className="supervisor-toolbar"><strong>Weekly submissions</strong><span className="supervisor-muted">{reports.filter((report) => report.submitted).length} of {reports.length} submitted</span></div><div className="supervisor-table-wrap"><table className="supervisor-table"><thead><tr><th>Report</th><th>Student</th><th>Submitted</th><th>Status</th><th>Action</th></tr></thead><tbody>{reports.map((report) => <tr key={report.student}><td><FileText size={15} /> <strong>{report.title}</strong></td><td>{report.student}</td><td>{report.submitted ? report.date : "-"}</td><td><Status value={report.submitted ? "Submitted" : "Pending"} /></td><td><button type="button" className="supervisor-action secondary">Review</button></td></tr>)}</tbody></table></div></section></div>;
}

export default Reports;
