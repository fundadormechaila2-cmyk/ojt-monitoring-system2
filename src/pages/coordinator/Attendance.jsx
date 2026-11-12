import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { CalendarDays, CheckCircle2, Clock3, Eye, Search, UserX, X } from "lucide-react";
import { formatHoursMinutes, getLocalDate, getRecordPeriods, summarizeAttendance } from "../../services/manualAttendanceService";
import { sortAttendanceRecords, withAttendanceTimes } from "../../services/attendanceRecord";
import { db } from "../../services/firebase";
import { withoutArchived } from "../../services/recordState";
import AttendanceRecord from "../../components/AttendanceRecord";
import { studentNameOf, useCoordinatorData } from "./coordinatorData";
import { buildAttendanceRows } from "./attendanceRows";
import "../../styles/attendance-management.css";
import "../../styles/coordinator-module.css";
import "../../styles/student-portal.css";
import "../../styles/student-attendance-qr.css";
import "../../styles/coordinator-attendance-record.css";

const statuses = ["Present", "Absent", "Late", "Incomplete"];

function normalizeRecord(record) {
  const periods = getRecordPeriods(record);
  const summary = summarizeAttendance(periods);
  return {
    ...record,
    ...periods,
    studentId: record.studentId || record.studentID || "",
    studentName: record.studentName || record.student || "Unnamed student",
    company: record.company || record.partnerCompany || "Not assigned",
    date: record.date || "",
    totalHours: summary.totalHours,
    status: record.status || summary.status,
    remarks: record.remarks || record.note || "",
  };
}

function Attendance() {
  const { data, loading, error } = useCoordinatorData();
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [companyFilter, setCompanyFilter] = useState("All companies");
  const [selectedId, setSelectedId] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [studentAttendance, setStudentAttendance] = useState(null);
  const assignedStudents = useMemo(() => withoutArchived(data.students), [data.students]);
  const tableStudents = useMemo(() => assignedStudents.map((student) => ({
    id: student.id,
    uid: student.studentUid || student.userUid || student.accountUid || "",
    name: studentNameOf(student),
    studentId: student.studentId || student.studentID || student.idNumber || "",
    company: student.company || student.partnerCompany || student.companyName || "Not assigned",
  })), [assignedStudents]);
  const selectedStudent = assignedStudents.find((student) => student.id === selectedStudentId);
  const selectedStudentUid = selectedStudent?.studentUid || selectedStudent?.userUid || selectedStudent?.accountUid || "";
  const selectedKey = selectedStudent ? `${selectedStudent.id}:${selectedStudentUid}` : "";
  useEffect(() => {
    if (!selectedStudent || !selectedStudentUid) return undefined;
    return onSnapshot(
      query(collection(db, "attendance"), where("studentUid", "==", selectedStudentUid)),
      (snapshot) => {
        setStudentAttendance({
          key: selectedKey,
          records: sortAttendanceRecords(
            snapshot.docs.map((document) => ({ id: document.id, ...document.data() })),
          ).map(withAttendanceTimes),
          error: "",
        });
      },
      (snapshotError) => {
        console.error("Unable to load the assigned student's attendance:", snapshotError);
        setStudentAttendance({
          key: selectedKey,
          records: [],
          error: "Attendance history could not be loaded. Check the student's assignment and Firestore permissions.",
        });
      },
    );
  }, [selectedKey, selectedStudent, selectedStudentUid]);

  const records = useMemo(() => data.attendance.map(normalizeRecord), [data.attendance]);
  const selectedRecord = records.find((record) => record.id === selectedId);
  const companies = useMemo(
    () => ["All companies", ...new Set([...records, ...tableStudents].map((item) => item.company).filter(Boolean))],
    [records, tableStudents],
  );
  const visibleRows = useMemo(() => buildAttendanceRows(tableStudents, records, {
    search,
    date: dateFilter,
    status: statusFilter,
    company: companyFilter,
  }), [tableStudents, records, search, dateFilter, statusFilter, companyFilter]);
  const summary = useMemo(() => records.reduce((result, record) => {
    if (record.date === getLocalDate()) {
      const status = record.status.toLowerCase();
      result[status] = (result[status] || 0) + 1;
    }
    return result;
  }, { present: 0, absent: 0, late: 0 }), [records]);

  if (selectedStudent) {
    const currentAttendance = studentAttendance?.key === selectedKey ? studentAttendance : null;
    const studentRecords = currentAttendance?.records || [];
    const totalHours = studentRecords.reduce((total, record) => total + record.totalHours, 0);
    return (
      <div className="coordinator-dtr-view">
        <button type="button" className="attendance-management-secondary coordinator-dtr-back" onClick={() => setSelectedStudentId("")}>
          Back to attendance
        </button>
        <div className="student-portal-page">
          <article className="student-card student-attendance-today-card coordinator-dtr-total">
            <div className="student-attendance-accumulated">
              <span>Total recorded hours</span>
              <strong>{currentAttendance && !currentAttendance.error ? formatHoursMinutes(totalHours) : "—"}</strong>
            </div>
          </article>
          <AttendanceRecord
            key={selectedKey}
            studentName={selectedStudent.fullName || selectedStudent.name || selectedStudent.studentName ||
              `${selectedStudent.firstName || ""} ${selectedStudent.lastName || ""}`.trim() || "Student"}
            studentId={selectedStudent.studentId || selectedStudent.studentID || selectedStudent.idNumber || "No student ID"}
            academicYear={selectedStudent.schoolYear || "Not provided"}
            records={studentRecords}
            loading={Boolean(selectedStudentUid) && !currentAttendance}
            error={!selectedStudentUid
              ? "This student has no linked account. Contact an administrator to link their student account."
              : currentAttendance?.error}
          />
        </div>
      </div>
    );
  }

  return (
    <main className="attendance-management-page">
      <header className="attendance-management-header">
        <div>
          <p className="attendance-management-eyebrow">LCCI · OJT MONITORING SYSTEM</p>
          <h1>Attendance</h1>
          <p>Review assigned students' attendance. Supervisors record and manage attendance.</p>
        </div>
      </header>

      {error && <div className="attendance-management-error" role="alert">{error}</div>}
      {!loading && !error && (
        <section className="attendance-summary-cards" aria-label="Attendance summary">
          <article><span className="attendance-summary-icon blue"><CalendarDays size={18} /></span><div><small>Total Students</small><strong>{data.students.length}</strong></div></article>
          <article><span className="attendance-summary-icon green"><CheckCircle2 size={18} /></span><div><small>Present Today</small><strong>{summary.present}</strong></div></article>
          <article><span className="attendance-summary-icon red"><UserX size={18} /></span><div><small>Absent Today</small><strong>{summary.absent}</strong></div></article>
          <article><span className="attendance-summary-icon amber"><Clock3 size={18} /></span><div><small>Late Today</small><strong>{summary.late}</strong></div></article>
        </section>
      )}

      <section className="attendance-management-panel">
        <div className="attendance-management-toolbar">
          <label className="attendance-management-search">
            <Search size={17} /><span className="sr-only">Search student attendance</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search student by name or ID" />
          </label>
          <div className="attendance-management-filters">
            <label><span className="sr-only">Filter by date</span><input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} /></label>
            <select aria-label="Filter by attendance status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option>All</option>{statuses.map((status) => <option key={status}>{status}</option>)}
            </select>
            <select aria-label="Filter by partner company" value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)}>
              {companies.map((company) => <option key={company}>{company}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="attendance-management-empty">Loading attendance records...</div>
        ) : error ? (
          <div className="attendance-management-empty">Attendance records are unavailable.</div>
        ) : visibleRows.length === 0 ? (
          <div className="attendance-management-empty">
            <strong>{assignedStudents.length ? "No matching attendance records" : "No assigned students"}</strong>
            <span>{assignedStudents.length ? "Try changing the search or filters." : "Assigned students will appear here."}</span>
          </div>
        ) : (
          <div className="attendance-management-table-wrap coordinator-attendance-table-wrap" role="region" aria-label="Assigned student attendance table" tabIndex={0}>
            <table className="attendance-management-table coordinator-attendance-table">
              <colgroup>
                <col className="coordinator-attendance-name-column" />
                <col className="coordinator-attendance-id-column" />
                <col className="coordinator-attendance-company-column" />
                <col className="coordinator-attendance-date-column" />
                <col span={6} className="coordinator-attendance-time-column" />
                <col className="coordinator-attendance-hours-column" />
                <col className="coordinator-attendance-status-column" />
                <col className="coordinator-attendance-details-column" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col" rowSpan={2}>Student Name</th>
                  <th scope="col" rowSpan={2}>Student ID</th>
                  <th scope="col" rowSpan={2}>Partner Company</th>
                  <th scope="col" rowSpan={2}>Date</th>
                  <th scope="colgroup" colSpan={2}>AM</th>
                  <th scope="colgroup" colSpan={2}>PM</th>
                  <th scope="colgroup" colSpan={2}>Overtime</th>
                  <th scope="col" rowSpan={2}>Total Hours</th>
                  <th scope="col" rowSpan={2}>Status</th>
                  <th scope="col" rowSpan={2}>Details</th>
                </tr>
                <tr>
                  <th scope="col">In</th><th scope="col">Out</th>
                  <th scope="col">In</th><th scope="col">Out</th>
                  <th scope="col">In</th><th scope="col">Out</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map(({ key, student, record, name, studentId, company }) => (
                  <tr key={key}>
                    <td>
                      {student ? (
                        <button
                          type="button"
                          className="coordinator-attendance-student-link"
                          onClick={() => setSelectedStudentId(student.id)}
                        >
                          {name}
                        </button>
                      ) : <strong>{name}</strong>}
                    </td>
                    <td>{studentId || "—"}</td><td>{company}</td><td>{record?.date || "—"}</td>
                    <td>{record?.amIn || "—"}</td><td>{record?.amOut || "—"}</td>
                    <td>{record?.pmIn || "—"}</td><td>{record?.pmOut || "—"}</td>
                    <td>{record?.overtimeIn || "—"}</td><td>{record?.overtimeOut || "—"}</td>
                    <td>{record ? formatHoursMinutes(record.totalHours) : "—"}</td>
                    <td>{record ? <span className={`attendance-management-status ${record.status.toLowerCase()}`}>{record.status}</span> : "—"}</td>
                    <td>{record ? <div className="attendance-management-actions"><button type="button" title="View details" aria-label={`View attendance details for ${name}`} onClick={() => setSelectedId(record.id)}><Eye size={15} /></button></div> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && !error && visibleRows.length > 0 && (
          <footer className="attendance-management-footer">Showing {visibleRows.length} attendance {visibleRows.length === 1 ? "row" : "rows"}</footer>
        )}
      </section>

      {selectedRecord && (
        <div className="attendance-management-backdrop" role="presentation" onClick={(event) => {
          if (event.target === event.currentTarget) setSelectedId("");
        }}>
          <section className="attendance-management-modal" role="dialog" aria-modal="true" aria-labelledby="attendance-management-modal-title">
            <header><div><p>Attendance details</p><h2 id="attendance-management-modal-title">{selectedRecord.studentName}</h2></div>
              <button type="button" aria-label="Close" onClick={() => setSelectedId("")}><X size={18} /></button>
            </header>
            <div className="attendance-management-details">
              <div><small>Student ID</small><strong>{selectedRecord.studentId || "—"}</strong></div>
              <div><small>Partner Company</small><strong>{selectedRecord.company}</strong></div>
              <div><small>Date</small><strong>{selectedRecord.date || "—"}</strong></div>
              <div><small>AM</small><strong>{selectedRecord.amIn || "—"} - {selectedRecord.amOut || "—"}</strong></div>
              <div><small>PM</small><strong>{selectedRecord.pmIn || "—"} - {selectedRecord.pmOut || "—"}</strong></div>
              <div><small>Overtime</small><strong>{selectedRecord.overtimeIn || "—"} - {selectedRecord.overtimeOut || "—"}</strong></div>
              <div><small>Total Hours</small><strong>{formatHoursMinutes(selectedRecord.totalHours)}</strong></div>
              <div><small>Status</small><strong>{selectedRecord.status}</strong></div>
              <div className="attendance-management-detail-wide"><small>Remarks</small><strong>{selectedRecord.remarks || "No remarks"}</strong></div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default Attendance;
