import { useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, updateDoc } from "firebase/firestore";
import { CheckCircle2, Edit3, Eye, Plus, Search, ShieldCheck, Trash2, UserRound, Users as UsersIcon, X } from "lucide-react";
import { db } from "../../services/firebase";
import { useAuth } from "../../context/useAuth";
import { COURSES, isApprovedCourse } from "../../constants/courses";
import { createManagedUser } from "../../services/userManagementSevice";
import "../../styles/users-management.css";

const roles = ["admin", "coordinator", "student"];
const statuses = ["ACTIVE", "INACTIVE"];
const emptyForm = { firstName: "", lastName: "", email: "", role: "student", status: "ACTIVE", studentId: "", course: "", company: "" };

function normalizeUser(record) {
  const status = String(record.status || "ACTIVE").toUpperCase();
  return {
    ...record,
    id: record.id || record.uid,
    name: `${record.firstName || ""} ${record.lastName || ""}`.trim() || record.fullName || "Unnamed user",
    role: roles.includes(record.role) ? record.role : "student",
    status: statuses.includes(status) ? status : "ACTIVE",
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
      && (status === "All statuses" || item.status === status);
  }), [role, search, status, users]);

  const summary = useMemo(() => ({
    total: users.length,
    students: users.filter((item) => item.role === "student").length,
    coordinators: users.filter((item) => item.role === "coordinator").length,
    admins: users.filter((item) => item.role === "admin").length,
  }), [users]);

  const showNotice = (message) => { setNotice(message); window.setTimeout(() => setNotice(""), 3000); };
  const clearFilters = () => { setSearch(""); setRole("All roles"); setStatus("All statuses"); };
  const openAdd = () => { setForm(emptyForm); setModal("add"); };
  const openEdit = (item) => { setForm({ ...emptyForm, ...item, email: item.email || "" }); setModal({ type: "edit", item }); };
  const saveUser = async (event) => {
    event.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) { setError("First name, last name, and email are required."); return; }
    if (form.course.trim() && !isApprovedCourse(form.course.trim())) { setError("Select an approved course."); return; }
    setSaving(true);
    try {
      const data = { firstName: form.firstName.trim(), lastName: form.lastName.trim(), email: form.email.trim(), role: form.role, status: form.status, studentId: form.studentId.trim(), course: form.course.trim(), company: form.company.trim(), updatedAt: new Date().toISOString() };
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
      } else {
        await updateDoc(doc(db, "users", modal.item.id), data);
        showNotice("User profile updated successfully.");
      }
      setModal(null);
      setError("");
    } catch (saveError) {
      console.error("Unable to save user profile:", saveError);
      setError("Unable to save user profile.");
    } finally { setSaving(false); }
  };
  const toggleStatus = async (item) => {
    if (!window.confirm(`${item.status === "ACTIVE" ? "Deactivate" : "Activate"} ${item.name}?`)) return;
    try {
      await updateDoc(doc(db, "users", item.id), { status: item.status === "ACTIVE" ? "INACTIVE" : "ACTIVE", updatedAt: new Date().toISOString() });
      showNotice(`User ${item.status === "ACTIVE" ? "deactivated" : "activated"} successfully.`);
    } catch (statusError) { console.error("Unable to change user status:", statusError); setError("Unable to update account status."); }
  };
  const deleteUser = async (item) => {
    if (item.id === user?.uid) { setError("You cannot delete your currently logged-in account."); return; }
    if (!window.confirm(`Delete ${item.name}? This removes the Firestore profile only; Firebase Authentication credentials are not deleted here.`)) return;
    try { await deleteDoc(doc(db, "users", item.id)); showNotice("User profile deleted successfully."); } catch (deleteError) { console.error("Unable to delete user:", deleteError); setError("Unable to delete user profile."); }
  };

  return (
    <main className="users-management">
      <header className="users-management-header"><div><p>LCCI · OJT MONITORING SYSTEM</p><h1>Users</h1><span>Manage user profiles, roles, and account access.</span></div><button type="button" className="users-primary" onClick={openAdd}><Plus size={16} /> Add User</button></header>
      <section className="users-management-summary"><article><UsersIcon size={19} /><div><small>Total Users</small><strong>{summary.total}</strong></div></article><article><UserRound size={19} /><div><small>Students</small><strong>{summary.students}</strong></div></article><article><ShieldCheck size={19} /><div><small>OJT Coordinators</small><strong>{summary.coordinators}</strong></div></article><article><CheckCircle2 size={19} /><div><small>Administrators</small><strong>{summary.admins}</strong></div></article></section>
      <section className="users-management-panel"><div className="users-management-toolbar"><label className="users-management-search"><Search size={16} /><span className="sr-only">Search users</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, or user ID" /></label><select aria-label="Filter by role" value={role} onChange={(event) => setRole(event.target.value)}><option>All roles</option>{roles.map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select><select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)}><option>All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select><button type="button" className="users-clear" onClick={clearFilters}>Clear Filters</button></div>{error && <div className="users-error" role="alert">{error}</div>}{loading ? <div className="users-empty">Loading users...</div> : filteredUsers.length === 0 ? <div className="users-empty">No users found.</div> : <div className="users-table-wrap"><table className="users-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Account Status</th><th>Date Created</th><th>Actions</th></tr></thead><tbody>{filteredUsers.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><small>{item.studentId || item.course || item.company || item.id}</small></td><td>{item.email || "—"}</td><td><span className={`users-role ${item.role}`}>{item.role}</span></td><td><span className={`users-status ${item.status.toLowerCase()}`}>{item.status === "ACTIVE" ? "Active" : "Inactive"}</span></td><td>{dateCreated(item.createdAt)}</td><td><div className="users-actions"><button type="button" title="View" onClick={() => setModal({ type: "view", item })}><Eye size={15} /></button><button type="button" title="Edit" onClick={() => openEdit(item)}><Edit3 size={15} /></button><button type="button" title={item.status === "ACTIVE" ? "Deactivate" : "Activate"} onClick={() => toggleStatus(item)}><CheckCircle2 size={15} /></button><button type="button" title="Delete" onClick={() => deleteUser(item)}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table></div>}</section>
      {modal && <div className="users-backdrop" role="presentation" onClick={(event) => event.target === event.currentTarget && setModal(null)}><section className="users-modal" role="dialog" aria-modal="true"><header><div><p>User management</p><h2>{modal === "add" ? "Add User" : modal.type === "edit" ? "Edit User" : modal.item.name}</h2></div><button type="button" aria-label="Close" onClick={() => setModal(null)}><X size={18} /></button></header>{modal === "view" ? <div className="users-details">{[["Full Name", modal.item.name], ["Email", modal.item.email], ["Role", modal.item.role], ["Account Status", modal.item.status === "ACTIVE" ? "Active" : "Inactive"], ["User ID", modal.item.id], ["Date Created", dateCreated(modal.item.createdAt)], ["Student ID", modal.item.studentId], ["Course / Program", modal.item.course || modal.item.program], ["Company / Assignment", modal.item.company || modal.item.partnerCompany]].filter(([, value]) => value).map(([label, value]) => <div key={label}><small>{label}</small><strong>{value}</strong></div>)}</div> : <form className="users-form" onSubmit={saveUser}><label>First Name<input value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} required /></label><label>Last Name<input value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} required /></label><label>Email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label><label>Role<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>{roles.map((item) => <option key={item}>{item}</option>)}</select></label><label>Status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>{statuses.map((item) => <option key={item}>{item}</option>)}</select></label><label>Student ID<input value={form.studentId} onChange={(event) => setForm({ ...form, studentId: event.target.value })} /></label><label>Course / Program<select value={form.course} onChange={(event) => setForm({ ...form, course: event.target.value })}><option value="">Select course</option>{COURSES.map((item) => <option key={item} value={item}>{item}</option>)}{form.course && !isApprovedCourse(form.course) && <option value={form.course}>{form.course} (existing record)</option>}</select></label><label>Partner Company<input value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} /></label><footer><button type="button" className="users-secondary" onClick={() => setModal(null)}>Cancel</button><button type="submit" className="users-primary" disabled={saving}>{saving ? "Saving..." : "Save User"}</button></footer></form>}</section></div>}
      {notice && <div className="users-notice" role="status">{notice}</div>}
    </main>
  );
}

export default Users;
