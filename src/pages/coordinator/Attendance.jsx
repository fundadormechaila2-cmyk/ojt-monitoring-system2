import { useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, Eye, Search, UserX, X } from "lucide-react";
import { formatHoursMinutes, getLocalDate, getRecordPeriods, summarizeAttendance } from "../../services/manualAttendanceService";
import { useCoordinatorData } from "./coordinatorData";
import "../../styles/attendance-management.css";
import "../../styles/coordinator-module.css";

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
    totalHours: Number(record.totalHours ?? record.hours ?? summary.totalHours),
    status: record.status || summary.status,
    remarks: record.remarks || record.note || "",
  };
}

function Attendance() {
  const { data, loading, error } = useCoordinatorData();
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState(getLocalDate);
  const [statusFilter, setStatusFilter] = useState("All");
  const [companyFilter, setCompanyFilter] = useState("All companies");
  const [selectedId, setSelectedId] = useState("");
  const records = useMemo(() => data.attendance.map(normalizeRecord), [data.attendance]);
  const selectedRecord = records.find((record) => record.id === selectedId);
  const companies = useMemo(
    () => ["All companies", ...new Set(records.map((record) => record.company).filter(Boolean))],
    [records],
  );
  const visibleRecords = useMemo(() => {
    const searchValue = search.trim().toLowerCase();
    return records.filter((record) =>
      (!searchValue || `${record.studentName} ${record.studentId} ${record.company}`.toLowerCase().includes(searchValue)) &&
      (!dateFilter || record.date === dateFilter) &&
      (statusFilter === "All" || record.status === statusFilter) &&
      (companyFilter === "All companies" || record.company === companyFilter),
    );
  }, [records, search, dateFilter, statusFilter, companyFilter]);
  const summary = useMemo(() => records.reduce((result, record) => {
    if (record.date === getLocalDate()) {
      const status = record.status.toLowerCase();
      result[status] = (result[status] || 0) + 1;
    }
    return result;
  }, { present: 0, absent: 0, late: 0 }), [records]);

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
        ) : visibleRecords.length === 0 ? (
          <div className="attendance-management-empty">
            <strong>{records.length ? "No matching attendance records" : "No attendance records yet"}</strong>
            <span>{records.length ? "Try changing the search or filters." : "Attendance records will appear here once supervisors record them."}</span>
          </div>
        ) : (
          <div className="attendance-management-table-wrap">
            <table className="attendance-management-table">
              <thead><tr><th>Student Name</th><th>Student ID</th><th>Partner Company</th><th>Date</th><th>AM In</th><th>AM Out</th><th>PM In</th><th>PM Out</th><th>Overtime In</th><th>Overtime Out</th><th>Total Hours</th><th>Status</th><th>Details</th></tr></thead>
              <tbody>
                {visibleRecords.map((record) => (
                  <tr key={record.id}>
                    <td><strong>{record.studentName}</strong></td>
                    <td>{record.studentId || "—"}</td><td>{record.company}</td><td>{record.date || "—"}</td>
                    <td>{record.amIn || "—"}</td><td>{record.amOut || "—"}</td>
                    <td>{record.pmIn || "—"}</td><td>{record.pmOut || "—"}</td>
                    <td>{record.overtimeIn || "—"}</td><td>{record.overtimeOut || "—"}</td>
                    <td>{formatHoursMinutes(record.totalHours)}</td>
                    <td><span className={`attendance-management-status ${record.status.toLowerCase()}`}>{record.status}</span></td>
                    <td><div className="attendance-management-actions"><button type="button" title="View details" aria-label={`View ${record.studentName}`} onClick={() => setSelectedId(record.id)}><Eye size={15} /></button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && !error && records.length > 0 && (
          <footer className="attendance-management-footer">Showing {visibleRecords.length} of {records.length} attendance records</footer>
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
