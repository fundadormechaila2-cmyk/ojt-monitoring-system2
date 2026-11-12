import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Edit3,
  Eye,
  Search,
  Trash2,
  UserX,
  X,
} from "lucide-react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../services/firebase";
import { useAuth } from "../../context/useAuth";
import "../../styles/attendance-management.css";
import "../../styles/coordinator-module.css";

const statuses = ["Present", "Absent", "Late", "Incomplete"];
const today = () => new Date().toISOString().slice(0, 10);

const emptyForm = {
  studentId: "",
  date: today(),
  timeIn: "",
  timeOut: "",
  status: "Present",
  remarks: "",
};

function getStudentName(student) {
  return (
    student.name ||
    student.fullName ||
    student.studentName ||
    `${student.firstName || ""} ${student.lastName || ""}`.trim() ||
    "Unnamed student"
  );
}

function getStudentId(student) {
  return (
    student.studentId || student.idNumber || student.studentID || student.id
  );
}

function getCompany(student) {
  return (
    student.company ||
    student.partnerCompany ||
    student.companyName ||
    "Not assigned"
  );
}

function getInitials(name) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function calculateHours(timeIn, timeOut) {
  if (!timeIn || !timeOut) return 0;
  const [inHour, inMinute] = timeIn.split(":").map(Number);
  const [outHour, outMinute] = timeOut.split(":").map(Number);
  return Number(
    ((outHour * 60 + outMinute - (inHour * 60 + inMinute)) / 60).toFixed(2),
  );
}

function normalizeRecord(record) {
  return {
    ...record,
    studentId: record.studentId || record.studentID || "",
    studentName: record.studentName || record.student || "Unnamed student",
    company: record.company || record.partnerCompany || "Not assigned",
    date: record.date || "",
    timeIn: record.timeIn || "",
    timeOut: record.timeOut || "",
    totalHours: Number(record.totalHours ?? record.hours ?? 0),
    status: record.status || "Incomplete",
    remarks: record.remarks || record.note || "",
  };
}

function Attendance() {
  const { user } = useAuth();
  const [students, setStudents] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState(today());
  const [statusFilter, setStatusFilter] = useState("All");
  const [companyFilter, setCompanyFilter] = useState("All companies");
  const [modal, setModal] = useState(null);
  const [editingRecord, setEditingRecord] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let studentsLoaded = false;
    let attendanceLoaded = false;

    const finishLoading = () => {
      if (studentsLoaded && attendanceLoaded) setLoading(false);
    };

    const unsubscribeStudents = onSnapshot(
      collection(db, "students"),
      (snapshot) => {
        setStudents(
          snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
        );
        studentsLoaded = true;
        finishLoading();
      },
      (snapshotError) => {
        console.error("Unable to load students for attendance:", snapshotError);
        setError(
          "Students could not be loaded. Check your Firestore permissions and try again.",
        );
        studentsLoaded = true;
        finishLoading();
      },
    );

    const unsubscribeAttendance = onSnapshot(
      collection(db, "attendance"),
      (snapshot) => {
        setRecords(
          snapshot.docs.map((item) =>
            normalizeRecord({ id: item.id, ...item.data() }),
          ),
        );
        attendanceLoaded = true;
        finishLoading();
      },
      (snapshotError) => {
        console.error("Unable to load attendance records:", snapshotError);
        setError(
          snapshotError.code === "permission-denied"
            ? "You do not have permission to view attendance records. Update your Firestore rules to allow coordinator access."
            : `Attendance records could not be loaded (${snapshotError.code || "unknown error"}).`,
        );
        attendanceLoaded = true;
        finishLoading();
      },
    );

    return () => {
      unsubscribeStudents();
      unsubscribeAttendance();
    };
  }, []);

  const studentMap = useMemo(
    () => new Map(students.map((student) => [getStudentId(student), student])),
    [students],
  );
  const companies = useMemo(
    () => [
      "All companies",
      ...new Set(records.map((record) => record.company).filter(Boolean)),
    ],
    [records],
  );
  const visibleRecords = useMemo(
    () =>
      records.filter((record) => {
        const searchValue = search.trim().toLowerCase();
        const matchesSearch =
          !searchValue ||
          `${record.studentName} ${record.studentId} ${record.company}`
            .toLowerCase()
            .includes(searchValue);
        return (
          matchesSearch &&
          (!dateFilter || record.date === dateFilter) &&
          (statusFilter === "All" || record.status === statusFilter) &&
          (companyFilter === "All companies" ||
            record.company === companyFilter)
        );
      }),
    [companyFilter, dateFilter, records, search, statusFilter],
  );

  const summary = useMemo(
    () =>
      records.reduce(
        (result, record) => {
          if (record.date === today()) {
            result[record.status.toLowerCase()] =
              (result[record.status.toLowerCase()] || 0) + 1;
          }
          return result;
        },
        { present: 0, absent: 0, late: 0 },
      ),
    [records],
  );

  const showNotice = (message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3000);
  };

  const openEdit = (record) => {
    setForm({
      studentId: record.studentId,
      date: record.date,
      timeIn: record.timeIn,
      timeOut: record.timeOut,
      status: record.status,
      remarks: record.remarks,
    });
    setEditingRecord(record);
    setFormError("");
    setModal("form");
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setFormError("");
    const student = studentMap.get(form.studentId);
    const hours = calculateHours(form.timeIn, form.timeOut);

    if (!student) {
      setFormError("Student is required.");
      return;
    }
    if (!form.date) {
      setFormError("Date is required.");
      return;
    }
    if (["Present", "Late"].includes(form.status) && !form.timeIn) {
      setFormError("Time In is required for Present or Late attendance.");
      return;
    }
    if (form.timeOut && !form.timeIn) {
      setFormError("Time In is required before entering Time Out.");
      return;
    }
    if (form.timeIn && form.timeOut && hours < 0) {
      setFormError("Time Out cannot be earlier than Time In.");
      return;
    }
    const duplicate = records.find(
      (record) =>
        record.studentId === form.studentId &&
        record.date === form.date &&
        record.id !== editingRecord?.id,
    );
    if (duplicate) {
      setFormError(
        "An attendance record already exists for this student and date.",
      );
      return;
    }

    const data = {
      studentId: form.studentId,
      studentName: getStudentName(student),
      company: getCompany(student),
      date: form.date,
      timeIn: form.timeIn,
      timeOut: form.timeOut,
      totalHours: hours,
      status: form.status,
      remarks: form.remarks.trim(),
      updatedBy: user?.uid || null,
      updatedAt: serverTimestamp(),
    };

    setSaving(true);
    try {
      if (editingRecord) {
        await updateDoc(doc(db, "attendance", editingRecord.id), data);
        showNotice("Attendance updated successfully.");
      } else {
        await addDoc(collection(db, "attendance"), {
          ...data,
          createdAt: serverTimestamp(),
        });
        showNotice("Attendance added successfully.");
      }
      setModal(null);
    } catch (saveError) {
      console.error("Unable to save attendance record:", saveError);
      setFormError("Attendance could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (record) => {
    if (
      !window.confirm(
        `Delete attendance for ${record.studentName} on ${record.date}?`,
      )
    )
      return;
    try {
      await deleteDoc(doc(db, "attendance", record.id));
      showNotice("Attendance deleted successfully.");
      if (modal?.id === record.id) setModal(null);
    } catch (deleteError) {
      console.error("Unable to delete attendance record:", deleteError);
      setError("Attendance could not be deleted. Please try again.");
    }
  };

  return (
    <main className="attendance-management-page">
      <header className="attendance-management-header">
        <div>
          <p className="attendance-management-eyebrow">
            LCCI · OJT MONITORING SYSTEM
          </p>
          <h1>Attendance</h1>
          <p>Monitor and manage student OJT attendance records.</p>
        </div>
      </header>

      <section
        className="attendance-summary-cards"
        aria-label="Attendance summary"
      >
        <article>
          <span className="attendance-summary-icon blue">
            <CalendarDays size={18} />
          </span>
          <div>
            <small>Total Students</small>
            <strong>{students.length}</strong>
          </div>
        </article>
        <article>
          <span className="attendance-summary-icon green">
            <CheckCircle2 size={18} />
          </span>
          <div>
            <small>Present Today</small>
            <strong>{summary.present}</strong>
          </div>
        </article>
        <article>
          <span className="attendance-summary-icon red">
            <UserX size={18} />
          </span>
          <div>
            <small>Absent Today</small>
            <strong>{summary.absent}</strong>
          </div>
        </article>
        <article>
          <span className="attendance-summary-icon amber">
            <Clock3 size={18} />
          </span>
          <div>
            <small>Late Today</small>
            <strong>{summary.late}</strong>
          </div>
        </article>
      </section>

      <section className="attendance-management-panel">
        <div className="attendance-management-toolbar">
          <label className="attendance-management-search">
            <Search size={17} />
            <span className="sr-only">Search student attendance</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search student by name or ID"
            />
          </label>
          <div className="attendance-management-filters">
            <label>
              <span className="sr-only">Filter by date</span>
              <input
                type="date"
                value={dateFilter}
                onChange={(event) => setDateFilter(event.target.value)}
              />
            </label>
            <select
              aria-label="Filter by attendance status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option>All</option>
              {statuses.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
            <select
              aria-label="Filter by partner company"
              value={companyFilter}
              onChange={(event) => setCompanyFilter(event.target.value)}
            >
              {companies.map((company) => (
                <option key={company}>{company}</option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="attendance-management-error" role="alert">
            {error}
          </div>
        )}
        {loading ? (
          <div className="attendance-management-empty">
            Loading attendance records...
          </div>
        ) : records.length === 0 ? (
          <div className="attendance-management-empty">
            <strong>No attendance records yet</strong>
            <span>
              Attendance records will appear here once they are added.
            </span>
          </div>
        ) : visibleRecords.length === 0 ? (
          <div className="attendance-management-empty">
            <strong>No matching attendance records</strong>
            <span>Try changing the search or filters.</span>
          </div>
        ) : (
          <div className="attendance-management-table-wrap">
            <table className="attendance-management-table">
              <thead>
                <tr>
                  <th>Student Name</th>
                  <th>Student ID</th>
                  <th>Partner Company</th>
                  <th>Date</th>
                  <th>Time In</th>
                  <th>Time Out</th>
                  <th>Total Hours</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleRecords.map((record) => (
                  <tr key={record.id}>
                    <td>
                      <div className="attendance-management-student">
                        <span>{getInitials(record.studentName)}</span>
                        <strong>{record.studentName}</strong>
                      </div>
                    </td>
                    <td>{record.studentId || "—"}</td>
                    <td>{record.company}</td>
                    <td>{record.date || "—"}</td>
                    <td>{record.timeIn || "—"}</td>
                    <td>{record.timeOut || "—"}</td>
                    <td>
                      {record.totalHours ? `${record.totalHours} hrs` : "—"}
                    </td>
                    <td>
                      <span
                        className={`attendance-management-status ${record.status.toLowerCase()}`}
                      >
                        {record.status}
                      </span>
                    </td>
                    <td>
                      <div className="attendance-management-actions">
                        <button
                          type="button"
                          title="View details"
                          aria-label={`View ${record.studentName}`}
                          onClick={() => setModal(record)}
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          type="button"
                          title="Edit"
                          aria-label={`Edit ${record.studentName}`}
                          onClick={() => openEdit(record)}
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          type="button"
                          title="Delete"
                          aria-label={`Delete ${record.studentName}`}
                          onClick={() => handleDelete(record)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && records.length > 0 && (
          <footer className="attendance-management-footer">
            Showing {visibleRecords.length} of {records.length} attendance
            records
          </footer>
        )}
      </section>

      {modal && (
        <div
          className="attendance-management-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setModal(null);
          }}
        >
          <section
            className="attendance-management-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="attendance-management-modal-title"
          >
            <header>
              <div>
                <p>
                  {modal === "form"
                    ? editingRecord
                      ? "Edit attendance record"
                      : "Attendance record"
                    : "Attendance details"}
                </p>
                <h2 id="attendance-management-modal-title">
                  {modal === "form"
                    ? editingRecord
                      ? "Edit Attendance"
                      : "Add Attendance"
                    : modal.studentName}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setModal(null)}
              >
                <X size={18} />
              </button>
            </header>
            {modal === "form" ? (
              <form onSubmit={handleSave}>
                <div className="attendance-management-form">
                  <label>
                    <span>Student *</span>
                    <select
                      value={form.studentId}
                      onChange={(event) =>
                        setForm({ ...form, studentId: event.target.value })
                      }
                    >
                      <option value="">Select student</option>
                      {students.map((student) => (
                        <option key={student.id} value={getStudentId(student)}>
                          {getStudentName(student)} · {getStudentId(student)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Date *</span>
                    <input
                      type="date"
                      value={form.date}
                      onChange={(event) =>
                        setForm({ ...form, date: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span>Time In</span>
                    <input
                      type="time"
                      value={form.timeIn}
                      onChange={(event) =>
                        setForm({ ...form, timeIn: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span>Time Out</span>
                    <input
                      type="time"
                      value={form.timeOut}
                      onChange={(event) =>
                        setForm({ ...form, timeOut: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span>Status *</span>
                    <select
                      value={form.status}
                      onChange={(event) =>
                        setForm({ ...form, status: event.target.value })
                      }
                    >
                      {statuses.map((status) => (
                        <option key={status}>{status}</option>
                      ))}
                    </select>
                  </label>
                  <label className="attendance-management-form-wide">
                    <span>Remarks</span>
                    <textarea
                      value={form.remarks}
                      onChange={(event) =>
                        setForm({ ...form, remarks: event.target.value })
                      }
                      rows="3"
                    />
                  </label>
                  {formError && (
                    <p
                      className="attendance-management-form-error"
                      role="alert"
                    >
                      {formError}
                    </p>
                  )}
                </div>
                <footer>
                  <button
                    type="button"
                    className="attendance-management-secondary"
                    onClick={() => setModal(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="attendance-primary-button"
                    disabled={saving}
                  >
                    {saving ? "Saving..." : "Save Attendance"}
                  </button>
                </footer>
              </form>
            ) : (
              <div className="attendance-management-details">
                <div>
                  <small>Student ID</small>
                  <strong>{modal.studentId || "—"}</strong>
                </div>
                <div>
                  <small>Partner Company</small>
                  <strong>{modal.company}</strong>
                </div>
                <div>
                  <small>Date</small>
                  <strong>{modal.date || "—"}</strong>
                </div>
                <div>
                  <small>Time</small>
                  <strong>
                    {modal.timeIn || "—"} - {modal.timeOut || "—"}
                  </strong>
                </div>
                <div>
                  <small>Total Hours</small>
                  <strong>{modal.totalHours || "—"}</strong>
                </div>
                <div>
                  <small>Status</small>
                  <strong>{modal.status}</strong>
                </div>
                <div className="attendance-management-detail-wide">
                  <small>Remarks</small>
                  <strong>{modal.remarks || "No remarks"}</strong>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
      {notice && (
        <div className="attendance-management-notice" role="status">
          {notice}
        </div>
      )}
    </main>
  );
}

export default Attendance;
