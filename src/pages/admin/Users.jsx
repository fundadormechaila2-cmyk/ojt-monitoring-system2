import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { Archive, ArchiveRestore, CheckCircle2, Edit3, Eye, Plus, Search, ShieldCheck, Trash2, UserRound, Users as UsersIcon, X } from "lucide-react";
import { db } from "../../services/firebase";
import { useAuth } from "../../context/useAuth";
import { COURSES, isApprovedCourse } from "../../constants/courses";
import { DEPARTMENTS, departmentFields, departmentIdFor, departmentLabel, recordDepartmentId } from "../../constants/departments";
import { createManagedUser } from "../../services/userManagementSevice";
import AccountActionDialog from "../../components/AccountActionDialog";
import "../../styles/users-management.css";

const roles = ["admin", "coordinator", "supervisor", "student"];
const statuses = ["ACTIVE", "INACTIVE"];
const emptyForm = { firstName: "", lastName: "", email: "", role: "student", status: "ACTIVE", studentId: "", course: "", company: "", coordinatorId: "", phone: "", department: "" };

function normalizeUser(record) {
  const rawStatus = String(record.status || "ACTIVE").toUpperCase();
  const status = record.isArchived === true
    ? "ARCHIVED"
    : record.isActive === false ? "INACTIVE" : rawStatus;
  return {
    ...record,
    id: record.id || record.uid,
    name: `${record.firstName || ""} ${record.lastName || ""}`.trim() || record.fullName || "Unnamed user",
    role: roles.includes(record.role) ? record.role : "student",
    status: statuses.includes(status) || status === "ARCHIVED" ? status : "ACTIVE",
  };
}

function dateCreated(value) {
  if (!value) return "—";
  if (typeof value.toDate === "function") return value.toDate().toLocaleDateString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function Users() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("All roles");
  const [status, setStatus] = useState("All statuses");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [accountAction, setAccountAction] = useState(null);

  useEffect(() => onSnapshot(collection(db, "users"), (snapshot) => {
    setUsers(snapshot.docs.map((item) => normalizeUser({ id: item.id, ...item.data() })));
    setLoading(false);
    setError("");
  }, (snapshotError) => {
    console.error("Unable to load users:", snapshotError);
    setLoading(false);
    setError("Unable to load users.");
  }), []);

  const filteredUsers = useMemo(() => users.filter((item) => {
    const query = search.trim().toLowerCase();
    return (!query || `${item.name} ${item.email || ""} ${item.id}`.toLowerCase().includes(query))
      && (role === "All roles" || item.role === role)
      && (status === "All statuses" ? item.status !== "ARCHIVED" : item.status === status);
  }), [role, search, status, users]);

  const summary = useMemo(() => {
    const current = users.filter((item) => item.status !== "ARCHIVED");
    return {
      total: current.length,
      students: current.filter((item) => item.role === "student").length,
      coordinators: current.filter((item) => item.role === "coordinator").length,
      admins: current.filter((item) => item.role === "admin").length,
    };
  }, [users]);

  const showNotice = (message) => { setNotice(message); window.setTimeout(() => setNotice(""), 3000); };
  const clearFilters = () => { setSearch(""); setRole("All roles"); setStatus("All statuses"); };
  const openAdd = () => { setForm(emptyForm); setModal("add"); };
  const openEdit = (item) => {
    setForm({
      ...emptyForm,
      ...item,
      email: item.email || "",
      department: item.role === "coordinator" ? departmentLabel(item.department) : item.department || "",
    });
    setModal({ type: "edit", item });
  };
  const saveUser = async (event) => {
    event.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) { setError("First name, last name, and email are required."); return; }
    if (modal?.type === "edit" && modal.item.role === "coordinator") {
      const departmentId = departmentIdFor(form.department);
      if (!departmentId) { setError("Select a department."); return; }
      const existing = users.find((item) =>
        item.id !== modal.item.id &&
        item.role === "coordinator" &&
        item.isArchived !== true &&
        item.isActive !== false &&
        recordDepartmentId(item) === departmentId,
      );
      if (departmentId === "BSBA" && existing) {
        setError(`${existing.name} already manages the BSBA department. Only one BSBA coordinator is allowed.`);
        return;
      }
    }
    if (form.course.trim() && !isApprovedCourse(form.course.trim())) { setError("Select an approved course."); return; }
    setSaving(true);
    try {
      const data = { firstName: form.firstName.trim(), lastName: form.lastName.trim(), email: form.email.trim(), role: form.role, studentId: form.studentId.trim(), course: form.course.trim(), company: form.company.trim(), updatedAt: new Date().toISOString() };
      if (modal === "add") {
        const managedUser = await createManagedUser({
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          role: data.role,
          createdBy: user?.uid || null,
        });
        await updateDoc(doc(db, "users", managedUser.uid), {
          studentId: data.studentId,
          course: data.course,
          company: data.company,
          updatedAt: new Date().toISOString(),
        });
        alert(`User created. Temporary password: ${managedUser.temporaryPassword}`);
      } else if (modal.item.role === "coordinator") {
        await updateDoc(doc(db, "users", modal.item.id), {
          firstName: data.firstName,
          lastName: data.lastName,
          coordinatorId: form.coordinatorId.trim(),
          phone: form.phone.trim(),
          department: form.department,
          ...departmentFields(form.department),
          updatedAt: serverTimestamp(),
        });
        showNotice("Coordinator profile updated successfully.");
      } else {
        // Status changes go through manageAccount; role is only written when it actually changed.
        const { role: nextRole, ...profileChanges } = data;
        await updateDoc(doc(db, "users", modal.item.id), nextRole === modal.item.role ? profileChanges : data);
        showNotice("User profile updated successfully.");
      }
      setModal(null);
      setError("");
    } catch (saveError) {
      console.error("Unable to save user profile:", saveError);
      setError("Unable to save user profile.");
    } finally { setSaving(false); }
  };
  const openAccountAction = (action, item) => setAccountAction({ action, target: { type: "user", id: item.id, name: item.name, email: item.email, role: item.role } });
  const finishAccountAction = (message, warnings) => {
    setAccountAction(null);
    setError("");
    showNotice([message, ...warnings].join(" "));
  };
  const isCoordinatorEdit =
    modal?.type === "edit" && modal.item.role === "coordinator";

  return (
    <main className="users-management">
      <header className="users-management-header"><div><p>LCCI · OJT MONITORING SYSTEM</p><h1>Users</h1><span>Manage user profiles, roles, and account access.</span></div><button type="button" className="users-primary" onClick={openAdd}><Plus size={16} /> Add User</button></header>
      <section className="users-management-summary"><article><UsersIcon size={19} /><div><small>Total Users</small><strong>{summary.total}</strong></div></article><article><UserRound size={19} /><div><small>Students</small><strong>{summary.students}</strong></div></article><article><ShieldCheck size={19} /><div><small>OJT Coordinators</small><strong>{summary.coordinators}</strong></div></article><article><CheckCircle2 size={19} /><div><small>Administrators</small><strong>{summary.admins}</strong></div></article></section>
      <section className="users-management-panel"><div className="users-management-toolbar"><label className="users-management-search"><Search size={16} /><span className="sr-only">Search users</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, or user ID" /></label><select aria-label="Filter by role" value={role} onChange={(event) => setRole(event.target.value)}><option>All roles</option>{roles.map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select><select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)}><option>All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="ARCHIVED">Archived</option></select><button type="button" className="users-clear" onClick={clearFilters}>Clear Filters</button></div>{error && <div className="users-error" role="alert">{error}</div>}{loading ? <div className="users-empty">Loading users...</div> : filteredUsers.length === 0 ? <div className="users-empty">No users found.</div> : <div className="users-table-wrap"><table className="users-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Account Status</th><th>Date Created</th><th>Actions</th></tr></thead><tbody>{filteredUsers.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><small>{item.studentId || item.course || item.company || item.id}</small></td><td>{item.email || "—"}</td><td><span className={`users-role ${item.role}`}>{item.role}</span></td><td><span className={`users-status ${item.status.toLowerCase()}`}>{item.status[0] + item.status.slice(1).toLowerCase()}</span></td><td>{dateCreated(item.createdAt)}</td><td><div className="users-actions"><button type="button" title="View" onClick={() => setModal({ type: "view", item })}><Eye size={15} /></button><button type="button" title="Edit" onClick={() => openEdit(item)}><Edit3 size={15} /></button>{item.status !== "ARCHIVED" && <button type="button" title={item.status === "ACTIVE" ? "Deactivate" : "Reactivate"} disabled={item.id === user?.uid} onClick={() => openAccountAction(item.status === "ACTIVE" ? "deactivate" : "reactivate", item)}><CheckCircle2 size={15} /></button>}{item.status === "ARCHIVED" ? <button type="button" title="Restore" onClick={() => openAccountAction("restore", item)}><ArchiveRestore size={15} /></button> : <button type="button" title="Archive" disabled={item.id === user?.uid} onClick={() => openAccountAction("archive", item)}><Archive size={15} /></button>}<button type="button" title="Delete permanently" disabled={item.id === user?.uid} onClick={() => openAccountAction("delete", item)}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table></div>}</section>
      {modal && (
        <div
          className="users-backdrop"
          role="presentation"
          onClick={(event) =>
            event.target === event.currentTarget && !saving && setModal(null)
          }
        >
          <section className="users-modal" role="dialog" aria-modal="true">
            <header>
              <div>
                <p>{isCoordinatorEdit ? "Coordinator account" : "User management"}</p>
                <h2>
                  {modal === "add"
                    ? "Add User"
                    : modal.type === "edit"
                      ? isCoordinatorEdit
                        ? "Edit Coordinator"
                        : "Edit User"
                      : modal.item.name}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close"
                disabled={saving}
                onClick={() => setModal(null)}
              >
                <X size={18} />
              </button>
            </header>
            {modal === "view" ? (
              <div className="users-details">
                {[
                  ["Full Name", modal.item.name],
                  ["Email", modal.item.email],
                  ["Role", modal.item.role],
                  ["Account Status", modal.item.status[0] + modal.item.status.slice(1).toLowerCase()],
                  ["User ID", modal.item.id],
                  ["Date Created", dateCreated(modal.item.createdAt)],
                  ["Coordinator ID", modal.item.coordinatorId],
                  ["Contact number", modal.item.phone],
                  ["Department", modal.item.department],
                  ["Student ID", modal.item.studentId],
                  ["Course / Program", modal.item.course || modal.item.program],
                  ["Company / Assignment", modal.item.company || modal.item.partnerCompany],
                ]
                  .filter(([, value]) => value)
                  .map(([label, value]) => (
                    <div key={label}>
                      <small>{label}</small>
                      <strong>{value}</strong>
                    </div>
                  ))}
              </div>
            ) : (
              <form className="users-form" onSubmit={saveUser}>
                <label>
                  First Name
                  <input
                    value={form.firstName}
                    onChange={(event) => setForm({ ...form, firstName: event.target.value })}
                    required
                  />
                </label>
                <label>
                  Last Name
                  <input
                    value={form.lastName}
                    onChange={(event) => setForm({ ...form, lastName: event.target.value })}
                    required
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    value={form.email}
                    readOnly={isCoordinatorEdit}
                    onChange={(event) => setForm({ ...form, email: event.target.value })}
                    required
                  />
                </label>
                {isCoordinatorEdit ? (
                  <>
                    <label>
                      Coordinator ID
                      <input
                        value={form.coordinatorId}
                        onChange={(event) => setForm({ ...form, coordinatorId: event.target.value })}
                      />
                    </label>
                    <label>
                      Contact number
                      <input
                        type="tel"
                        value={form.phone}
                        onChange={(event) => setForm({ ...form, phone: event.target.value })}
                      />
                    </label>
                    <label>
                      Department
                      <select
                        value={form.department}
                        onChange={(event) => setForm({ ...form, department: event.target.value })}
                        required
                      >
                        <option value="">Select department</option>
                        {DEPARTMENTS.map((department) => (
                          <option key={department.id} value={department.label}>
                            {department.label}
                          </option>
                        ))}
                        {form.department &&
                          !DEPARTMENTS.some((department) => department.label === form.department) && (
                            <option value={form.department}>{form.department}</option>
                          )}
                      </select>
                    </label>
                  </>
                ) : (
                  <>
                    <label>
                      Role
                      <select
                        value={form.role}
                        onChange={(event) => setForm({ ...form, role: event.target.value })}
                      >
                        {roles.map((item) => <option key={item}>{item}</option>)}
                      </select>
                    </label>
                    <label>
                      Status
                      <select
                        value={form.status}
                        disabled
                        title="Use the account actions in the table to change status"
                        onChange={(event) => setForm({ ...form, status: event.target.value })}
                      >
                        {statuses.map((item) => <option key={item}>{item}</option>)}
                      </select>
                    </label>
                    <label>
                      Student ID
                      <input
                        value={form.studentId}
                        onChange={(event) => setForm({ ...form, studentId: event.target.value })}
                      />
                    </label>
                    <label>
                      Course / Program
                      <select
                        value={form.course}
                        onChange={(event) => setForm({ ...form, course: event.target.value })}
                      >
                        <option value="">Select course</option>
                        {COURSES.map((item) => <option key={item} value={item}>{item}</option>)}
                        {form.course && !isApprovedCourse(form.course) && (
                          <option value={form.course}>{form.course} (existing record)</option>
                        )}
                      </select>
                    </label>
                    <label>
                      Partner Company
                      <input
                        value={form.company}
                        onChange={(event) => setForm({ ...form, company: event.target.value })}
                      />
                    </label>
                  </>
                )}
                {isCoordinatorEdit && (
                  <p className="users-form-note">
                    The email address is the coordinator's login and cannot be changed here.
                  </p>
                )}
                {error && <div className="users-error" role="alert">{error}</div>}
                <footer>
                  <button
                    type="button"
                    className="users-secondary"
                    disabled={saving}
                    onClick={() => setModal(null)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="users-primary" disabled={saving}>
                    {saving ? "Saving..." : isCoordinatorEdit ? "Save changes" : "Save User"}
                  </button>
                </footer>
              </form>
            )}
          </section>
        </div>
      )}
      {accountAction && <AccountActionDialog {...accountAction} onClose={() => setAccountAction(null)} onDone={finishAccountAction} />}
      {notice && <div className="users-notice" role="status">{notice}</div>}
    </main>
  );
}

export default Users;
