import { Eye, Plus, Trash2, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import "../../styles/student-portal.css";

const defaultDocuments = [
  {
    id: 1,
    name: "Resume",
    description: "Updated student resume for OJT placement",
    deadline: "2026-09-20",
    status: "Submitted",
    review: "Approved",
    uploadedAt: "2026-09-07",
    remarks: "Ready for use.",
  },
  {
    id: 2,
    name: "Endorsement Letter",
    description: "Company endorsement from department head",
    deadline: "2026-09-22",
    status: "Pending Review",
    review: "In review",
    uploadedAt: "2026-09-15",
    remarks: "Awaiting final verification.",
  },
  {
    id: 3,
    name: "Medical Certificate",
    description: "Physical examination clearance",
    deadline: "2026-09-18",
    status: "Submitted",
    review: "Approved",
    uploadedAt: "2026-09-05",
    remarks: "Valid and approved.",
  },
  {
    id: 4,
    name: "Memorandum of Agreement",
    description: "Company and school agreement copy",
    deadline: "2026-09-24",
    status: "Not Submitted",
    review: "Required",
    uploadedAt: "-",
    remarks: "Please upload as soon as possible.",
  },
  {
    id: 5,
    name: "Daily Time Record",
    description: "Weekly attendance log and DTR",
    deadline: "2026-09-25",
    status: "Submitted",
    review: "Pending",
    uploadedAt: "2026-09-18",
    remarks: "Needs final sign-off.",
  },
  {
    id: 6,
    name: "Weekly Reports",
    description: "Weekly accomplishment reports",
    deadline: "2026-09-26",
    status: "Submitted",
    review: "Approved",
    uploadedAt: "2026-09-18",
    remarks: "On track.",
  },
  {
    id: 7,
    name: "Final OJT Report",
    description: "Comprehensive end-of-training report",
    deadline: "2026-11-30",
    status: "Not Submitted",
    review: "Required",
    uploadedAt: "-",
    remarks: "To be prepared later.",
  },
  {
    id: 8,
    name: "Certificate of Completion",
    description: "Final training completion document",
    deadline: "2026-12-15",
    status: "Not Submitted",
    review: "Required",
    uploadedAt: "-",
    remarks: "Not yet generated.",
  },
];

function StudentsDocuments() {
  const [documents, setDocuments] = useState(defaultDocuments);

  const summary = useMemo(() => {
    const counts = {
      total: documents.length,
      submitted: 0,
      pending: 0,
      rejected: 0,
      notSubmitted: 0,
    };
    documents.forEach((document) => {
      if (
        document.status === "Submitted" ||
        document.status === "Pending Review"
      )
        counts.submitted += 1;
      if (document.status === "Pending Review") counts.pending += 1;
      if (document.status === "Rejected") counts.rejected += 1;
      if (document.status === "Not Submitted") counts.notSubmitted += 1;
    });
    return counts;
  }, [documents]);

  const handleDelete = (id) => {
    setDocuments((current) => current.filter((document) => document.id !== id));
  };

  return (
    <div className="student-portal-page">
      <header className="student-page-header">
        <div>
          <p className="student-meta">Document management</p>
          <h1>Student Documents</h1>
        </div>
        <div className="student-header-actions">
          <button type="button" className="student-button primary">
            <Plus size={15} /> Upload Document
          </button>
        </div>
      </header>

      <section className="student-overview-grid">
        <div className="student-card student-stat-card">
          <p className="student-stat-label">Total documents</p>
          <div className="student-stat-value">
            <strong>{summary.total}</strong>
            <span className="student-stat-trend neutral">Files</span>
          </div>
        </div>
        <div className="student-card student-stat-card">
          <p className="student-stat-label">Submitted</p>
          <div className="student-stat-value">
            <strong>{summary.submitted}</strong>
            <span className="student-stat-trend positive">Ready</span>
          </div>
        </div>
        <div className="student-card student-stat-card">
          <p className="student-stat-label">Pending review</p>
          <div className="student-stat-value">
            <strong>{summary.pending}</strong>
            <span className="student-stat-trend neutral">Waiting</span>
          </div>
        </div>
        <div className="student-card student-stat-card">
          <p className="student-stat-label">Not submitted</p>
          <div className="student-stat-value">
            <strong>{summary.notSubmitted}</strong>
            <span className="student-stat-trend negative">Action</span>
          </div>
        </div>
      </section>

      <section className="student-card student-panel">
        <div className="student-panel-header">
          <div>
            <p className="student-panel-subtitle">Required files</p>
            <h2 className="student-panel-title">Document Checklist</h2>
          </div>
        </div>

        <table className="student-document-list">
          <thead>
            <tr>
              <th>Document</th>
              <th>Description</th>
              <th>Deadline</th>
              <th>Status</th>
              <th>Review</th>
              <th>Uploaded</th>
              <th>Remarks</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((document) => (
              <tr key={document.id}>
                <td>{document.name}</td>
                <td>{document.description}</td>
                <td>
                  {new Date(`${document.deadline}T00:00:00`).toLocaleDateString(
                    "en-US",
                    { month: "short", day: "numeric", year: "numeric" },
                  )}
                </td>
                <td>
                  <span
                    className={
                      document.status === "Submitted" ||
                      document.status === "Approved"
                        ? "status-badge active"
                        : document.status === "Pending Review"
                          ? "status-badge pending"
                          : document.status === "Rejected"
                            ? "status-badge absent"
                            : "status-badge completed"
                    }
                  >
                    {document.status}
                  </span>
                </td>
                <td>{document.review}</td>
                <td>{document.uploadedAt}</td>
                <td>{document.remarks}</td>
                <td>
                  <div className="student-header-actions">
                    <button
                      type="button"
                      className="student-mini-button"
                      title="View/Download"
                    >
                      <Eye size={14} />
                    </button>
                    <button
                      type="button"
                      className="student-mini-button"
                      title="Upload/Replace"
                    >
                      <Upload size={14} />
                    </button>
                    <button
                      type="button"
                      className="student-mini-button"
                      title="Delete"
                      onClick={() => handleDelete(document.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export default StudentsDocuments;
