import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { PencilLine, Plus, Search, Trash2, X } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { db } from "../../services/firebase";
import "../../styles/student-portal.css";

const journalCollection = "journals";

function getLocalDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

const emptyForm = {
  date: getLocalDate(),
  tasks: "",
  skills: "",
  challenges: "",
  reflection: "",
};

const emptyJournalEntry = {
  date: "",
  taskPerformed: "",
  skillsLearned: "",
  problemsEncountered: "",
  reflection: "",
};

const editFieldStyle = {
  width: "100%",
  minWidth: 0,
  maxWidth: "100%",
  padding: "8px",
  border: "1px solid #dbe3ed",
  borderRadius: "8px",
  color: "#172033",
  font: '12px "Trebuchet MS", "Segoe UI", sans-serif',
};

function getDateValue(value) {
  if (value?.toDate) return value.toDate().toISOString().slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return typeof value === "string" ? value.slice(0, 10) : "";
}

function formatDate(value) {
  const dateValue = getDateValue(value);
  if (!dateValue) return "";
  const date = new Date(`${dateValue}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? dateValue
    : date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

function getJournalAccessError(error, operation) {
  if (error?.code === "permission-denied") {
    return `Firestore denied access to ${operation}. Verify the deployed rules allow students to access their own journal records.`;
  }
  return `Unable to ${operation}. Please try again.`;
}

function StudentReports() {
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const [loadedUid, setLoadedUid] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyJournalEntry);
  const [savingId, setSavingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const loading = Boolean(user?.uid) && loadedUid !== user.uid;

  useEffect(() => {
    if (!isAddModalOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !isSubmitting) {
        setIsAddModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAddModalOpen, isSubmitting]);

  useEffect(() => {
    if (!user?.uid) return undefined;
    const recordsQuery = query(
      collection(db, journalCollection),
      where("studentUid", "==", user.uid),
    );
    return onSnapshot(
      recordsQuery,
      (snapshot) => {
        setRecords(snapshot.docs.map((record) => ({ id: record.id, ...record.data() })));
        setLoadedUid(user.uid);
      },
      (loadError) => {
        console.error("Unable to load journal records:", loadError);
        setMessage({
          type: "error",
          text: getJournalAccessError(loadError, "load your journal records"),
        });
        setLoadedUid(user.uid);
      },
    );
  }, [user?.uid]);

  const filteredRecords = useMemo(() => {
    const ownRecords = loadedUid === user?.uid ? records : [];
    if (!search.trim()) return ownRecords;
    const query = search.trim().toLowerCase();
    return ownRecords.filter((record) =>
      [
        getDateValue(record.date),
        record.taskPerformed,
        record.skillsLearned,
        record.problemsEncountered,
        record.reflection,
      ].some((value) => String(value || "").toLowerCase().includes(query)),
    );
  }, [loadedUid, records, search, user?.uid]);

  const handleChange = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const closeAddModal = () => {
    if (isSubmitting) return;
    setIsAddModalOpen(false);
    setForm(emptyForm);
    setError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;
    if (!form.date || !form.tasks.trim()) {
      setError("Date and tasks performed are required.");
      return;
    }
    if (!user?.uid) {
      setError("Your session has expired. Please log in again.");
      return;
    }

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, journalCollection), {
        studentUid: user.uid,
        date: form.date,
        taskPerformed: form.tasks.trim(),
        skillsLearned: form.skills.trim(),
        problemsEncountered: form.challenges.trim(),
        reflection: form.reflection.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setForm(emptyForm);
      setError("");
      setIsAddModalOpen(false);
      setMessage({ type: "success", text: "Journal report submitted successfully." });
    } catch (submitError) {
      console.error("Unable to submit journal report:", submitError);
      setError("Unable to submit your report. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEditing = (record) => {
    if (!user?.uid || record.studentUid !== user.uid) {
      setMessage({ type: "error", text: "You can only edit your own journal entries." });
      return;
    }
    setEditingId(record.id);
    setEditForm({
      date: getDateValue(record.date),
      taskPerformed: record.taskPerformed || "",
      skillsLearned: record.skillsLearned || "",
      problemsEncountered: record.problemsEncountered || "",
      reflection: record.reflection || "",
    });
    setMessage(null);
  };

  const handleEditChange = (field, value) => {
    setEditForm((current) => ({ ...current, [field]: value }));
  };

  const handleSaveEdit = async (record) => {
    if (!user?.uid) {
      setMessage({ type: "error", text: "Your session has expired. Please log in again." });
      return;
    }
    if (record.studentUid !== user.uid) {
      setMessage({ type: "error", text: "You can only edit your own journal entries." });
      return;
    }
    if (!editForm.date) {
      setMessage({ type: "error", text: "Date is required to save this journal entry." });
      return;
    }

    setSavingId(record.id);
    try {
      await updateDoc(doc(db, journalCollection, record.id), {
        ...editForm,
        updatedAt: serverTimestamp(),
      });
      setEditingId(null);
      setEditForm(emptyJournalEntry);
      setMessage({ type: "success", text: "Journal entry updated successfully." });
    } catch (saveError) {
      console.error("Unable to update journal entry:", saveError);
      setMessage({
        type: "error",
        text: getJournalAccessError(saveError, "update this journal entry"),
      });
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (record) => {
    if (!user?.uid) {
      setMessage({ type: "error", text: "Your session has expired. Please log in again." });
      return;
    }
    if (record.studentUid !== user.uid) {
      setMessage({ type: "error", text: "You can only delete your own journal entries." });
      return;
    }
    if (!window.confirm("Permanently delete this journal entry? This cannot be undone.")) {
      return;
    }

    setDeletingId(record.id);
    try {
      await deleteDoc(doc(db, journalCollection, record.id));
      if (editingId === record.id) {
        setEditingId(null);
        setEditForm(emptyJournalEntry);
      }
      setMessage({ type: "success", text: "Journal entry deleted successfully." });
    } catch (deleteError) {
      console.error("Unable to delete journal entry:", deleteError);
      setMessage({
        type: "error",
        text: getJournalAccessError(deleteError, "delete this journal entry"),
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="student-portal-page">
      <header className="student-page-header">
        <div>
          <p className="student-meta">Reporting</p>
          <h1>My Journal</h1>
        </div>
        <div className="student-header-actions">
          <button
            type="button"
            className="student-button primary"
            onClick={() => {
              setForm(emptyForm);
              setError("");
              setIsAddModalOpen(true);
            }}
          >
            <Plus size={15} /> Add New
          </button>
        </div>
      </header>

      <section className="student-card student-panel">
        <div className="student-panel-header">
          <div>
            <p className="student-panel-subtitle">Weekly tracking</p>
            <h2 className="student-panel-title">Report Management</h2>
          </div>
          <div className="student-field" style={{ minWidth: "220px" }}>
            <label htmlFor="reportSearch" style={{ display: "none" }}>
              Search reports
            </label>
            <div style={{ position: "relative" }}>
              <Search
                size={14}
                style={{
                  position: "absolute",
                  left: "10px",
                  top: "10px",
                  color: "#718096",
                }}
              />
              <input
                id="reportSearch"
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search reports"
                style={{ paddingLeft: "32px" }}
              />
            </div>
          </div>
        </div>

        {(message || !user?.uid) && (
          <div
            role={message?.type === "error" || !user?.uid ? "alert" : "status"}
            style={{
              marginBottom: "12px",
              padding: "12px 14px",
              border: `1px solid ${message?.type === "error" || !user?.uid ? "#f0c9cc" : "#b9e8d4"}`,
              borderRadius: "10px",
              background: message?.type === "error" || !user?.uid ? "#fff0f1" : "#e8f8f1",
              color: message?.type === "error" || !user?.uid ? "#a33b43" : "#208d67",
              fontSize: "12px",
              fontWeight: 700,
            }}
          >
            {message?.text || "Unable to identify your student account."}
          </div>
        )}

        <div className="journal-table-wrap">
          <table className="student-table journal-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Task Performed</th>
                <th>Skills Learned</th>
                <th>Problems Encountered</th>
                <th>Reflection</th>
              </tr>
            </thead>
            <tbody>
            {loading ? (
              <tr>
                <td colSpan={5}>
                  <div className="student-empty-state">Loading journal records...</div>
                </td>
              </tr>
            ) : filteredRecords.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div className="student-empty-state">
                    {search ? "No journal records found." : "No journal records yet."}
                  </div>
                </td>
              </tr>
            ) : (
              filteredRecords.map((record) => {
                const isEditing = editingId === record.id;
                return (
                  <tr key={record.id}>
                    <td>
                      {isEditing ? (
                        <input
                          type="date"
                          value={editForm.date}
                          onChange={(event) => handleEditChange("date", event.target.value)}
                          aria-label="Date"
                          style={editFieldStyle}
                        />
                      ) : (
                        formatDate(record.date)
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <textarea
                          value={editForm.taskPerformed}
                          onChange={(event) => handleEditChange("taskPerformed", event.target.value)}
                          aria-label="Task Performed"
                          rows={3}
                          style={editFieldStyle}
                        />
                      ) : record.taskPerformed}
                    </td>
                    <td>
                      {isEditing ? (
                        <textarea
                          value={editForm.skillsLearned}
                          onChange={(event) => handleEditChange("skillsLearned", event.target.value)}
                          aria-label="Skills Learned"
                          rows={3}
                          style={editFieldStyle}
                        />
                      ) : record.skillsLearned}
                    </td>
                    <td>
                      {isEditing ? (
                        <textarea
                          value={editForm.problemsEncountered}
                          onChange={(event) => handleEditChange("problemsEncountered", event.target.value)}
                          aria-label="Problems Encountered"
                          rows={3}
                          style={editFieldStyle}
                        />
                      ) : record.problemsEncountered}
                    </td>
                    <td>
                      {isEditing ? (
                        <>
                          <textarea
                            value={editForm.reflection}
                            onChange={(event) => handleEditChange("reflection", event.target.value)}
                            aria-label="Reflection"
                            rows={3}
                            style={editFieldStyle}
                          />
                          <div className="student-header-actions journal-row-actions" style={{ marginTop: "8px" }}>
                            <button
                              type="button"
                              className="student-button primary"
                              onClick={() => handleSaveEdit(record)}
                              disabled={savingId === record.id}
                            >
                              {savingId === record.id ? "Saving..." : "Save"}
                            </button>
                            <button
                              type="button"
                              className="student-button"
                              onClick={() => {
                                setEditingId(null);
                                setEditForm(emptyJournalEntry);
                              }}
                              disabled={savingId === record.id}
                            >
                              Cancel
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="journal-reflection-actions">
                          <span>{record.reflection}</span>
                          <div className="student-header-actions journal-row-actions">
                            <button
                              type="button"
                              className="journal-icon-button edit"
                              title="Edit"
                              aria-label="Edit journal report"
                              onClick={() => startEditing(record)}
                            >
                              <PencilLine size={14} />
                            </button>
                            <button
                              type="button"
                              className="journal-icon-button delete"
                              title="Delete"
                              aria-label="Delete journal report"
                              onClick={() => handleDelete(record)}
                              disabled={deletingId === record.id}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
            </tbody>
          </table>
        </div>
      </section>

      {isAddModalOpen && (
        <div
          className="journal-modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeAddModal();
          }}
        >
          <section
            className="student-card student-panel journal-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="journal-modal-title"
          >
            <div className="student-panel-header journal-modal-header">
              <div>
                <p className="student-panel-subtitle">New report</p>
                <h2 id="journal-modal-title" className="student-panel-title">
                  Submit Report
                </h2>
              </div>
              <button
                type="button"
                className="journal-modal-close"
                onClick={closeAddModal}
                aria-label="Close submit report form"
                disabled={isSubmitting}
              >
                <X size={20} />
              </button>
            </div>

            <form className="journal-submit-form" onSubmit={handleSubmit}>
              <div className="student-form-grid">
                <div className="student-field">
                  <label htmlFor="journalDate">Date</label>
                  <input
                    id="journalDate"
                    type="date"
                    value={form.date}
                    onChange={(event) => handleChange("date", event.target.value)}
                    required
                  />
                </div>
                <div className="student-field">
                  <label htmlFor="journalAttachment">Attachment</label>
                  <input id="journalAttachment" type="file" />
                </div>
                <div className="student-field full">
                  <label htmlFor="journalTasks">Tasks performed</label>
                  <textarea
                    id="journalTasks"
                    value={form.tasks}
                    onChange={(event) => handleChange("tasks", event.target.value)}
                    required
                  />
                </div>
                <div className="student-field">
                  <label htmlFor="journalSkills">Skills learned</label>
                  <textarea
                    id="journalSkills"
                    value={form.skills}
                    onChange={(event) => handleChange("skills", event.target.value)}
                  />
                </div>
                <div className="student-field">
                  <label htmlFor="journalChallenges">Problems encountered</label>
                  <textarea
                    id="journalChallenges"
                    value={form.challenges}
                    onChange={(event) => handleChange("challenges", event.target.value)}
                  />
                </div>
                <div className="student-field full">
                  <label htmlFor="journalReflection">Reflection / remarks</label>
                  <textarea
                    id="journalReflection"
                    value={form.reflection}
                    onChange={(event) => handleChange("reflection", event.target.value)}
                  />
                </div>
              </div>

              {error && (
                <div
                  className="student-warning-box"
                  style={{ marginBottom: "12px" }}
                  role="alert"
                >
                  {error}
                </div>
              )}

              <div className="student-actions-row">
                <button
                  type="button"
                  className="student-button"
                  onClick={closeAddModal}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="student-button primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Submitting..." : "Submit Report"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

export default StudentReports;
