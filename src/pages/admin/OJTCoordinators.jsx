import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  Plus,
  Search,
  Users,
  X,
} from "lucide-react";
import {
  DEPARTMENTS,
  departmentIdFor,
  departmentLabel,
  recordDepartmentId,
} from "../../constants/departments";
import { useAuth } from "../../context/useAuth";
import { db } from "../../services/firebase";
import { createManagedUser } from "../../services/userManagementSevice";
import "./OJTCoordinators.css";

const emptyForm = {
  coordinatorId: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  department: "",
};

function coordinatorName(coordinator) {
  return (
    `${coordinator.firstName || ""} ${coordinator.lastName || ""}`.trim() ||
    coordinator.fullName ||
    coordinator.displayName ||
    "Unnamed coordinator"
  );
}

function coordinatorIdentifier(coordinator) {
  return coordinator.coordinatorId || coordinator.id;
}

function OJTCoordinators() {
  const { user } = useAuth();
  const [coordinators, setCoordinators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("All departments");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [selectedCoordinator, setSelectedCoordinator] = useState(null);
  const [addingCoordinator, setAddingCoordinator] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    return onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        setCoordinators(
          snapshot.docs
            .map((item) => ({ id: item.id, ...item.data() }))
            .filter((item) => item.role === "coordinator" && item.isArchived !== true),
        );
        setLoadError("");
        setLoading(false);
      },
      (snapshotError) => {
        console.error("Unable to load coordinator accounts:", snapshotError);
        setLoadError("Coordinator accounts could not be loaded. Check Firestore permissions.");
        setLoading(false);
      },
    );
  }, []);

  const departments = useMemo(
    () => [
      ...new Set([
        ...DEPARTMENTS.map((department) => department.label),
        ...coordinators
          .map((coordinator) => departmentLabel(coordinator.department))
          .filter(Boolean),
      ]),
    ],
    [coordinators],
  );

  const filteredCoordinators = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return coordinators.filter((coordinator) => {
      const matchesSearch =
        !query ||
        `${coordinatorName(coordinator)} ${coordinatorIdentifier(coordinator)} ${coordinator.email || ""} ${coordinator.department || ""}`
          .toLowerCase()
          .includes(query);
      const status = String(coordinator.status || "ACTIVE").toUpperCase();
      const matchesStatus =
        statusFilter === "All statuses" || status === statusFilter;
      const matchesDepartment =
        departmentFilter === "All departments" ||
        departmentLabel(coordinator.department) === departmentFilter;
      return matchesSearch && matchesStatus && matchesDepartment;
    });
  }, [coordinators, departmentFilter, searchTerm, statusFilter]);

  const activeCount = coordinators.filter(
    (coordinator) => String(coordinator.status || "ACTIVE").toUpperCase() === "ACTIVE",
  ).length;
  const pendingPasswordChanges = coordinators.filter(
    (coordinator) => coordinator.mustChangePassword,
  ).length;

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const closeForm = () => {
    if (saving) return;
    setAddingCoordinator(false);
    setForm(emptyForm);
    setError("");
  };

  const createCoordinator = async (event) => {
    event.preventDefault();
    setError("");

    const departmentId = departmentIdFor(form.department);
    const existing = coordinators.find(
      (coordinator) =>
        recordDepartmentId(coordinator) === departmentId &&
        String(coordinator.status || "ACTIVE").toUpperCase() !== "INACTIVE",
    );
    if (departmentId === "BSBA" && existing) {
      setError(
        `${coordinatorName(existing)} already manages the BSBA department (Financial and Marketing Management). Only one BSBA coordinator is allowed.`,
      );
      return;
    }

    setSaving(true);
    let managedUser;
    try {
      managedUser = await createManagedUser({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone,
        role: "coordinator",
        createdBy: user?.uid || null,
        coordinatorId: form.coordinatorId.trim(),
        department: form.department,
      });

      setAddingCoordinator(false);
      setForm(emptyForm);
      setNotice(`Coordinator account created for ${form.firstName.trim()} ${form.lastName.trim()}.`);
      window.setTimeout(() => setNotice(""), 5000);
      window.alert(
        `Coordinator account created.\n\nEmail: ${managedUser.email}\nTemporary password: ${managedUser.temporaryPassword}`,
      );
    } catch (createError) {
      console.error("Unable to create coordinator account:", createError);
      setError(
        managedUser
          ? `The account exists, but the coordinator profile could not be fully saved. Temporary password: ${managedUser.temporaryPassword}. ${createError.message}`
          : createError.message || "Unable to create coordinator account.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="coordinators-page coordinators-state">
        Loading coordinator accounts...
      </main>
    );
  }

  return (
    <main className="coordinators-page">
      <header className="coordinators-header">
        <div>
          <p className="coordinators-eyebrow">OJT management</p>
          <h1>OJT Coordinators</h1>
          <p className="coordinators-subtitle">
            Create and manage coordinator profiles and login access.
          </p>
        </div>
        <button
          type="button"
          className="coordinators-primary"
          onClick={() => {
            setForm(emptyForm);
            setError("");
            setAddingCoordinator(true);
          }}
        >
          <Plus size={17} /> Add Coordinator
        </button>
      </header>

      {(loadError || error) && (
        <div className="coordinators-alert" role="alert">
          <AlertCircle size={17} />
          <span>{error || loadError}</span>
        </div>
      )}

      {notice && (
        <div className="coordinators-notice" role="status">
          <CheckCircle2 size={17} /> {notice}
        </div>
      )}

      <section className="coordinators-summary" aria-label="Coordinator summary">
        <article>
          <span className="coordinators-summary-icon blue"><Users size={19} /></span>
          <div><p>Total Coordinators</p><strong>{coordinators.length}</strong></div>
        </article>
        <article>
          <span className="coordinators-summary-icon green"><CheckCircle2 size={19} /></span>
          <div><p>Active Accounts</p><strong>{activeCount}</strong></div>
        </article>
        <article>
          <span className="coordinators-summary-icon amber"><AlertCircle size={19} /></span>
          <div><p>First Login Password Changes</p><strong>{pendingPasswordChanges}</strong></div>
        </article>
      </section>

      <section className="coordinators-panel">
        <div className="coordinators-toolbar">
          <label className="coordinators-search">
            <Search size={16} />
            <span className="sr-only">Search coordinators</span>
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search name, ID, email, or department"
            />
          </label>
          <div className="coordinators-filters">
            <select
              aria-label="Filter by department"
              value={departmentFilter}
              onChange={(event) => setDepartmentFilter(event.target.value)}
            >
              <option>All departments</option>
              {departments.map((department) => (
                <option key={department} value={department}>{department}</option>
              ))}
            </select>
            <select
              aria-label="Filter by account status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option>All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
        </div>

        <div className="coordinators-table-wrap">
          <table className="coordinators-table">
            <thead>
              <tr>
                <th>Coordinator</th>
                <th>Coordinator ID</th>
                <th>Department</th>
                <th>Email</th>
                <th>Contact</th>
                <th>Status</th>
                <th>Account</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {filteredCoordinators.map((coordinator) => {
                const status = String(coordinator.status || "ACTIVE").toUpperCase();
                return (
                  <tr key={coordinator.id}>
                    <td><strong>{coordinatorName(coordinator)}</strong></td>
                    <td>{coordinatorIdentifier(coordinator)}</td>
                    <td>{coordinator.department || "—"}</td>
                    <td>{coordinator.email || "—"}</td>
                    <td>{coordinator.phone || "—"}</td>
                    <td>
                      <span className={`coordinators-status ${status.toLowerCase()}`}>
                        {status === "ACTIVE" ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>{coordinator.mustChangePassword ? "Password change required" : "Ready"}</td>
                    <td>
                      <button
                        type="button"
                        className="coordinators-icon-button"
                        title="View coordinator details"
                        aria-label={`View ${coordinatorName(coordinator)}`}
                        onClick={() => setSelectedCoordinator(coordinator)}
                      >
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!filteredCoordinators.length && (
            <div className="coordinators-empty">
              {loadError
                ? "Coordinator records are unavailable."
                : coordinators.length
                  ? "No coordinators match these filters."
                  : "No coordinator accounts yet. Add a coordinator to get started."}
            </div>
          )}
        </div>
        <footer className="coordinators-footer">
          Showing {filteredCoordinators.length} of {coordinators.length} coordinators
        </footer>
      </section>

      {addingCoordinator && (
        <div
          className="coordinators-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeForm();
          }}
        >
          <section
            className="coordinators-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-coordinator-title"
          >
            <header>
              <div>
                <p>Coordinator account</p>
                <h2 id="add-coordinator-title">Add Coordinator</h2>
                <span>Create the coordinator profile and login credentials.</span>
              </div>
              <button
                type="button"
                aria-label="Close"
                disabled={saving}
                onClick={closeForm}
              >
                <X size={18} />
              </button>
            </header>
            <form className="coordinators-form" onSubmit={createCoordinator}>
              <label>
                First name
                <input required value={form.firstName} onChange={(event) => updateField("firstName", event.target.value)} />
              </label>
              <label>
                Last name
                <input required value={form.lastName} onChange={(event) => updateField("lastName", event.target.value)} />
              </label>
              <label>
                Email address
                <input type="email" required value={form.email} onChange={(event) => updateField("email", event.target.value)} />
              </label>
              <label>
                Coordinator ID
                <input value={form.coordinatorId} onChange={(event) => updateField("coordinatorId", event.target.value)} />
              </label>
              <label>
                Contact number
                <input type="tel" value={form.phone} onChange={(event) => updateField("phone", event.target.value)} />
              </label>
              <label>
                Department
                <select required value={form.department} onChange={(event) => updateField("department", event.target.value)}>
                  <option value="">Select department</option>
                  {DEPARTMENTS.map((department) => (
                    <option key={department.id} value={department.label}>{department.label}</option>
                  ))}
                </select>
              </label>
              <p className="coordinators-form-note">
                A temporary password will be generated. The coordinator will be asked to change it after signing in.
              </p>
              <footer>
                <button type="button" className="coordinators-secondary" disabled={saving} onClick={closeForm}>Cancel</button>
                <button type="submit" className="coordinators-primary" disabled={saving}>
                  {saving ? "Creating account..." : "Create coordinator"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {selectedCoordinator && (
        <div
          className="coordinators-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setSelectedCoordinator(null);
          }}
        >
          <section className="coordinators-dialog" role="dialog" aria-modal="true" aria-labelledby="coordinator-details-title">
            <header>
              <div>
                <p>Coordinator details</p>
                <h2 id="coordinator-details-title">{coordinatorName(selectedCoordinator)}</h2>
                <span>{coordinatorIdentifier(selectedCoordinator)}</span>
              </div>
              <button type="button" aria-label="Close" onClick={() => setSelectedCoordinator(null)}><X size={18} /></button>
            </header>
            <dl className="coordinators-details">
              <div><dt>Email</dt><dd>{selectedCoordinator.email || "—"}</dd></div>
              <div><dt>Contact number</dt><dd>{selectedCoordinator.phone || "—"}</dd></div>
              <div><dt>Department</dt><dd>{departmentLabel(selectedCoordinator.department) || "—"}</dd></div>
              <div><dt>Status</dt><dd>{String(selectedCoordinator.status || "ACTIVE").toUpperCase()}</dd></div>
            </dl>
          </section>
        </div>
      )}
    </main>
  );
}

export default OJTCoordinators;
