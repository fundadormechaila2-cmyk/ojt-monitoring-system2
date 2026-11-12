import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { formatAttendanceDate } from "../services/attendanceRecord";

function AttendanceRecord({
  studentName,
  studentId,
  academicYear,
  records,
  loading,
  error,
  studentRecordError,
}) {
  const [dateFilter, setDateFilter] = useState("");
  const visibleRecords = useMemo(
    () => records.filter((record) => !dateFilter || record.date === dateFilter),
    [records, dateFilter],
  );

  return (
    <section className="student-attendance-history">
      <div className="attendance-record-toolbar">
        <div className="attendance-record-toolbar-heading">
          <h2>Attendance History</h2>
          <p>{dateFilter ? "Only the selected date will be printed." : "View and print your OJT attendance record."}</p>
        </div>
        <div className="attendance-record-toolbar-actions">
          <label>
            Filter by date
            <input
              type="date"
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
            />
          </label>
          {dateFilter && (
            <button type="button" onClick={() => setDateFilter("")}>
              Clear filter
            </button>
          )}
          <button
            type="button"
            className="attendance-record-print"
            onClick={() => window.print()}
          >
            <Printer size={16} aria-hidden="true" />
            Print Attendance Record
          </button>
        </div>
      </div>

      <div className="attendance-record-paper">
        <header className="attendance-record-heading">
          <h2>OJT STUDENT ATTENDANCE RECORD</h2>
          <div className="attendance-record-student-details">
            <div><span>Student Name</span><strong>{studentName}</strong></div>
            <div><span>Student ID Number</span><strong>{studentId}</strong></div>
            <div><span>Academic Year</span><strong>{academicYear}</strong></div>
          </div>
        </header>

        {studentRecordError && (
          <p className="attendance-record-error" role="alert">{studentRecordError}</p>
        )}
        {error && (
          <p className="attendance-record-error" role="alert">{error}</p>
        )}
        <div
          className="attendance-record-table-wrap"
          role="region"
          aria-label="Attendance record table"
          tabIndex={0}
        >
          <table className="attendance-record-table">
            <colgroup>
              <col className="attendance-record-date-column" />
              <col span={6} />
            </colgroup>
            <thead>
              <tr>
                <th rowSpan={2}>Date</th>
                <th colSpan={2}>AM</th>
                <th colSpan={2}>PM</th>
                <th colSpan={2}>Overtime</th>
              </tr>
              <tr>
                {["Time In", "Time Out", "Time In", "Time Out", "Time In", "Time Out"].map((label, index) => (
                  <th key={index}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7}>Loading attendance records...</td></tr>
              ) : error ? (
                <tr><td colSpan={7}>Attendance records are unavailable.</td></tr>
              ) : visibleRecords.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    {records.length
                      ? "No attendance records found for this date."
                      : "No attendance records have been recorded yet."}
                  </td>
                </tr>
              ) : (
                visibleRecords.map((record) => (
                  <tr key={record.id}>
                    <td>{formatAttendanceDate(record.date)}</td>
                    <td>{record.amIn || "—"}</td>
                    <td>{record.amOut || "—"}</td>
                    <td>{record.pmIn || "—"}</td>
                    <td>{record.pmOut || "—"}</td>
                    <td>{record.overtimeIn || "—"}</td>
                    <td>{record.overtimeOut || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export default AttendanceRecord;
