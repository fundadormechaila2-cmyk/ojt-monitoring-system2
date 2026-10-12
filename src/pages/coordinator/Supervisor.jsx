import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import {
  AlertCircle,
  Check,
  Eye,
  Plus,
  Search,
  ShieldCheck,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { db } from "../../services/firebase";
import { createManagedUser } from "../../services/userManagementSevice";

const emptyForm = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  studentRecordId: "",
  partnerCompanyId: "",
  company: "",
  position: "",
};

function displayName(supervisor) {
  return (
    `${supervisor.firstName || ""} ${supervisor.lastName || ""}`.trim() ||
    supervisor.fullName ||
    supervisor.email ||
    "Unnamed supervisor"
  );
}

function studentName(student) {
  return student.name || student.fullName ||
    `${student.firstName || ""} ${student.lastName || ""}`.trim() ||
    student.email || student.studentId || student.id;
}

function companyName(company) {
  return company.companyName || company.name || company.businessName ||
    company.company || company.email || company.id;
}

function formatDate(value) {
  if (!value) return "—";
  const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date);
}

function Supervisor() {
  const { user } = useAuth();
  const [supervisors, setSupervisors] = useState([]);
  const [students, setStudents] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [referenceLoading, setReferenceLoading] = useState(true);
  const [referenceError, setReferenceError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [createdAccount, setCreatedAccount] = useState(null);

  useEffect(() => {
    if (user?.role !== "coordinator" || !user.uid || !user.department) {
      return undefined;
    }
    const supervisorsQuery = query(
      collection(db, "users"),
      where("role", "==", "supervisor"),
      where("department", "==", user?.department || ""),
    );

    return onSnapshot(
      supervisorsQuery,
      (snapshot) => {
        setSupervisors(
          snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
        );
        setLoading(false);
        setLoadError("");
      },
      (snapshotError) => {
        console.error("Unable to load supervisor accounts:", snapshotError);
        setLoading(false);
        setLoadError(
          `Supervisor accounts could not be loaded (${snapshotError.code || "unknown error"}): ${snapshotError.message || "Check the active Firebase project, Firestore rules, and indexes."}`,
        );
      },
    );
  }, [user?.department, user?.role, user?.uid]);

  useEffect(() => {
    if (user?.role !== "coordinator" || !user.uid) {
      return undefined;
    }

    let studentsLoaded = false;
    let companiesLoaded = false;
    const updateReferenceLoading = () => {
      setReferenceLoading(!(studentsLoaded && companiesLoaded));
    };
    const unsubscribeStudents = onSnapshot(
      query(collection(db, "students"), where("coordinatorUid", "==", user.uid)),
      (snapshot) => {
        setStudents(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
        studentsLoaded = true;
        updateReferenceLoading();
        setReferenceError("");
      },
      (snapshotError) => {
        console.error("Unable to load coordinator students:", snapshotError);
        setReferenceError(`Assigned students could not be loaded (${snapshotError.code || "unknown error"}).`);
        studentsLoaded = true;
        updateReferenceLoading();
      },
    );
    const unsubscribeCompanies = onSnapshot(
      collection(db, "partnerCompanies"),
      (snapshot) => {
        setCompanies(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
        companiesLoaded = true;
        updateReferenceLoading();
        setReferenceError("");
      },
      (snapshotError) => {
        console.error("Unable to load partner companies:", snapshotError);
        setReferenceError(`Partner companies could not be loaded (${snapshotError.code || "unknown error"}).`);
        companiesLoaded = true;
        updateReferenceLoading();
      },
    );
    return () => {
      unsubscribeStudents();
      unsubscribeCompanies();
    };
  }, [user?.role, user?.uid]);

  const hasSupervisorAssignment = (student) =>
    Boolean(student.supervisorUid || supervisors.some(
      (supervisor) => supervisor.assignedStudentRecordId === student.id,
    ));

  const visibleSupervisors = useMemo(() => {
    const term = search.trim().toLowerCase();
    return supervisors
      .filter((supervisor) => {
        const fullName = displayName(supervisor);
        const student = students.find((item) => item.id === supervisor.assignedStudentRecordId);
        const company = companies.find((item) => item.id === supervisor.partnerCompanyId);
        return (
          !term ||
          `${fullName} ${supervisor.email || ""} ${supervisor.phone || ""} ${supervisor.position || ""} ${student ? studentName(student) : ""} ${company ? companyName(company) : supervisor.company || ""}`
            .toLowerCase()
            .includes(term)
        );
      })
      .sort((a, b) => displayName(a).localeCompare(displayName(b)));
  }, [companies, search, students, supervisors]);

  const activeCount = supervisors.filter(
    (supervisor) => String(supervisor.status || "ACTIVE").toUpperCase() === "ACTIVE",
  ).length;

  const openAddModal = () => {
    setForm(emptyForm);
    setFormError("");
    setModal({ type: "add" });
  };

  const closeModal = () => {
    if (saving) return;
    setModal(null);
    setFormError("");
  };

  const addSupervisor = async (event) => {
    event.preventDefault();
    if (saving) return;
    setFormError("");
    setCreatedAccount(null);

    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    const email = form.email.trim().toLowerCase();
    const student = students.find((item) => item.id === form.studentRecordId);
    const company = form.company.trim();
    const matchedCompany = companies.find((item) =>
      companyName(item).trim().toLowerCase() === company.toLowerCase(),
    );
    if (!firstName || !lastName || !email || !student || !company || !user?.department) {
      setFormError("Complete the required fields and select an assigned student and partner company.");
      return;
    }
    if (student.coordinatorUid !== user.uid) {
      setFormError("You can only assign supervisors to students in your department.");
      return;
    }
    if (hasSupervisorAssignment(student)) {
      setFormError("This student already has an assigned supervisor.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFormError("Enter a valid email address.");
      return;
    }

    setSaving(true);
    try {
      const account = await createManagedUser({
        firstName,
        lastName,
        email,
        phone: form.phone.trim(),
        role: "supervisor",
        createdBy: user.uid,
        department: user.department,
        assignedStudentRecordId: student.id,
        partnerCompanyId: matchedCompany?.id || "",
        company,
        position: form.position,
        studentId: student.studentId || student.studentID || student.id,
      });
      setCreatedAccount({
        name: `${firstName} ${lastName}`,
        email: account.email,
        temporaryPassword: account.temporaryPassword,
      });
      setModal(null);
      setForm(emptyForm);
    } catch (createError) {
      console.error("Unable to create supervisor account:", createError);
      setFormError(createError.message || "Unable to create supervisor account and assignment.");
    } finally {
      setSaving(false);
    }
  };

  if (user?.role !== "coordinator" || !user.department) {
    return (
      <main className="min-h-full px-4 py-6 sm:px-6 lg:px-8">
        <p className="text-sm text-rose-700" role="alert">
          A coordinator profile with an assigned department is required.
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-full bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-blue-700">
              LCCI · OJT Monitoring System
            </p>
            <h1 className="m-0 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Supervisors
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Manage supervisor accounts and add supervisors to the system.
            </p>
          </div>
          <button
            className="inline-flex w-fit items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-200"
            type="button"
            onClick={openAddModal}
          >
            <Plus size={17} aria-hidden="true" />
            Add Supervisor
          </button>
        </header>

        <section
          className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2"
          aria-label="Supervisor account summary"
        >
          <SummaryCard
            icon={UsersRound}
            label="Total Supervisors"
            value={loading ? "…" : supervisors.length}
            tone="blue"
          />
          <SummaryCard
            icon={ShieldCheck}
            label="Active Accounts"
            value={loading ? "…" : activeCount}
            tone="emerald"
          />
        </section>

        {createdAccount && (
          <section
            className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
            aria-live="polite"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <Check className="mt-0.5 shrink-0 text-emerald-700" size={18} />
                <div>
                  <p className="font-semibold">
                    Supervisor account created for {createdAccount.name}.
                  </p>
                  <p className="mt-1">
                    Sign-in email: <strong>{createdAccount.email}</strong>
                  </p>
                  <p className="mt-1">
                    Temporary password:{" "}
                    <code className="rounded bg-white/80 px-2 py-0.5 font-mono text-emerald-950">
                      {createdAccount.temporaryPassword}
                    </code>
                  </p>
                  <p className="mt-2 text-xs text-emerald-800">
                    Share this password securely. The supervisor will be asked to change it after signing in.
                  </p>
                </div>
              </div>
              <button
                className="rounded p-1 text-emerald-700 hover:bg-emerald-100"
                type="button"
                aria-label="Dismiss account created message"
                onClick={() => setCreatedAccount(null)}
              >
                <X size={17} />
              </button>
            </div>
          </section>
        )}

        {loadError && (
          <div
            className="mb-5 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
            role="alert"
          >
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <p>{loadError}</p>
          </div>
        )}
        {referenceError && (
          <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">
            {referenceError}
          </div>
        )}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <h2 className="m-0 text-lg font-bold text-slate-900">
                Supervisor Directory
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Supervisor user accounts registered in the system.
              </p>
            </div>
            <label className="flex w-full items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-slate-400 transition focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-100 sm:max-w-sm">
              <Search size={17} aria-hidden="true" />
              <span className="sr-only">Search supervisors</span>
              <input
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:ring-0"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, email, or phone"
              />
            </label>
          </div>

          {loading ? (
            <div className="grid min-h-56 place-items-center px-6 text-sm text-slate-500">
              Loading supervisors…
            </div>
          ) : visibleSupervisors.length === 0 ? (
            <div className="grid min-h-56 place-items-center px-6 text-center">
              <div>
                <span className="mx-auto mb-3 grid size-11 place-items-center rounded-full bg-slate-100 text-slate-500">
                  <UserRound size={20} />
                </span>
                <p className="font-semibold text-slate-700">
                  {search ? "No supervisors match your search" : "No supervisors added yet"}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {search
                    ? "Try searching with a different name, email, or phone number."
                    : "Add a supervisor to create their system account."}
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] border-collapse text-left">
                <thead>
                  <tr className="bg-slate-50/80">
                    <th className="px-6 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                      Supervisor
                    </th>
                    <th className="px-6 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                      Email
                    </th>
                    <th className="px-6 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                      Phone
                    </th>
                    <th className="px-6 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                      Account Status
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleSupervisors.map((supervisor) => {
                    const name = displayName(supervisor);
                    const initials = name
                      .split(/\s+/)
                      .map((part) => part[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase();
                    const status = String(supervisor.status || "ACTIVE").toUpperCase();
                    return (
                      <tr
                        className="border-t border-slate-100 transition hover:bg-slate-50/70"
                        key={supervisor.id}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-blue-50 text-sm font-bold text-blue-700">
                              {initials}
                            </span>
                            <strong className="text-sm font-semibold text-slate-800">
                              {name}
                            </strong>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          {supervisor.email || "—"}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          {supervisor.phone || "—"}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
                              status === "ACTIVE"
                                ? "bg-emerald-50 text-emerald-700 ring-emerald-600/15"
                                : "bg-slate-100 text-slate-600 ring-slate-500/15"
                            }`}
                          >
                            <span className="size-1.5 rounded-full bg-current" />
                            {status.toLowerCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100"
                            type="button"
                            onClick={() => setModal({ type: "view", supervisor })}
                            aria-label={`View profile for ${name}`}
                          >
                            <Eye size={15} aria-hidden="true" />
                            View profile
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <footer className="border-t border-slate-100 px-6 py-3 text-xs text-slate-500">
            Showing {visibleSupervisors.length} of {supervisors.length} supervisor
            {supervisors.length === 1 ? "" : "s"}
          </footer>
        </section>
      </div>

      {modal?.type === "add" && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4 backdrop-blur-[2px]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <section
            aria-labelledby="add-supervisor-title"
            aria-modal="true"
            className="max-h-[90svh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl"
            role="dialog"
          >
            <ModalHeader
              title="Add Supervisor"
              onClose={closeModal}
              disabled={saving}
            />
            <form className="space-y-4 p-6" onSubmit={addSupervisor}>
              <p className="text-sm text-slate-500">
                Create a supervisor account. A temporary password will be generated automatically.
              </p>
              {formError && (
                <div
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800"
                  role="alert"
                >
                  {formError}
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  label="First name"
                  name="firstName"
                  value={form.firstName}
                  onChange={(value) =>
                    setForm((current) => ({ ...current, firstName: value }))
                  }
                  required
                  autoComplete="given-name"
                />
                <FormField
                  label="Last name"
                  name="lastName"
                  value={form.lastName}
                  onChange={(value) =>
                    setForm((current) => ({ ...current, lastName: value }))
                  }
                  required
                  autoComplete="family-name"
                />
              </div>
              <FormField
                label="Email address"
                name="email"
                type="email"
                value={form.email}
                onChange={(value) =>
                  setForm((current) => ({ ...current, email: value }))
                }
                required
                autoComplete="email"
              />
              <FormField
                label="Phone number"
                name="phone"
                type="tel"
                value={form.phone}
                onChange={(value) =>
                  setForm((current) => ({ ...current, phone: value }))
                }
                autoComplete="tel"
              />
              <label className="block text-sm font-medium text-slate-700" htmlFor="supervisor-position">
                Position
                <input
                  className="mt-1.5 block box-border min-w-0 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  id="supervisor-position"
                  value={form.position}
                  onChange={(event) => setForm((current) => ({ ...current, position: event.target.value }))}
                  autoComplete="organization-title"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700" htmlFor="supervisor-company">
                Partner company <span className="text-rose-600">*</span>
                <input
                  className="mt-1.5 block box-border min-w-0 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  id="supervisor-company"
                  list="partner-company-suggestions"
                  required
                  disabled={saving}
                  value={form.company}
                  onChange={(event) => {
                    const company = event.target.value;
                    const matchedCompany = companies.find((item) => companyName(item).toLowerCase() === company.trim().toLowerCase());
                    setForm((current) => ({
                      ...current,
                      company,
                      partnerCompanyId: matchedCompany?.id || "",
                    }));
                  }}
                  placeholder="Type partner company"
                />
                <datalist id="partner-company-suggestions">
                  {companies.map((company) => <option key={company.id} value={companyName(company)} />)}
                </datalist>
              </label>
              <label className="block text-sm font-medium text-slate-700" htmlFor="supervisor-student">
                Assigned OJT student <span className="text-rose-600">*</span>
                <select
                  className="mt-1.5 block box-border min-w-0 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  id="supervisor-student"
                  required
                  disabled={saving || referenceLoading || students.filter((student) => !hasSupervisorAssignment(student)).length === 0}
                  value={form.studentRecordId}
                  onChange={(event) => {
                    const studentRecordId = event.target.value;
                    const student = students.find((item) => item.id === studentRecordId);
                    const company = student?.company || student?.partnerCompany || student?.companyName || "";
                    const matchedCompany = companies.find((item) => companyName(item).toLowerCase() === company.trim().toLowerCase());
                    setForm((current) => ({
                      ...current,
                      studentRecordId,
                      ...(company && !current.company ? { company } : {}),
                      ...(!current.company && company ? { partnerCompanyId: matchedCompany?.id || "" } : {}),
                    }));
                  }}
                >
                  <option value="">{referenceLoading ? "Loading assigned students..." : "Select OJT student"}</option>
                  {students.filter((student) => !hasSupervisorAssignment(student)).map((student) => <option key={student.id} value={student.id}>{studentName(student)} · {student.studentId || student.studentID || student.id}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="block font-medium text-slate-700">Department</span><span className="text-slate-500">{user?.department || "Not assigned"}</span></div>
                <div><span className="block font-medium text-slate-700">Account status</span><span className="text-slate-500">Active</span></div>
              </div>
              {referenceError && <p className="text-sm text-rose-700" role="alert">{referenceError}</p>}
              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60"
                  type="submit"
                  disabled={saving || referenceLoading || Boolean(referenceError) || !students.some((student) => !hasSupervisorAssignment(student))}
                >
                  <Plus size={16} />
                  {saving ? "Creating…" : "Create Supervisor"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {modal?.type === "view" && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4 backdrop-blur-[2px]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <section
            aria-labelledby="supervisor-profile-title"
            aria-modal="true"
            className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
            role="dialog"
          >
            <ModalHeader
              title="Supervisor Profile"
              onClose={closeModal}
            />
            <dl className="grid gap-3 p-6 sm:grid-cols-2">
              <ProfileDetail
                label="Name"
                value={displayName(modal.supervisor)}
              />
              <ProfileDetail
                label="Role"
                value="Supervisor"
              />
              <ProfileDetail
                label="Email"
                value={modal.supervisor.email || "Not provided"}
              />
              <ProfileDetail
                label="Phone"
                value={modal.supervisor.phone || "Not provided"}
              />
              <ProfileDetail
                label="Position"
                value={modal.supervisor.position || "Not provided"}
              />
              <ProfileDetail
                label="Department"
                value={modal.supervisor.department || "Not provided"}
              />
              <ProfileDetail
                label="Assigned student"
                value={studentName(students.find((student) => student.id === modal.supervisor.assignedStudentRecordId) || {}) || "Not assigned"}
              />
              <ProfileDetail
                label="Partner company"
                value={companyName(companies.find((company) => company.id === modal.supervisor.partnerCompanyId) || { name: modal.supervisor.company }) || "Not assigned"}
              />
              <ProfileDetail
                label="Account status"
                value={String(modal.supervisor.status || "ACTIVE").toLowerCase()}
              />
              <ProfileDetail
                label="Date added"
                value={formatDate(modal.supervisor.createdAt)}
              />
            </dl>
          </section>
        </div>
      )}
    </main>
  );
}

function SummaryCard({ icon: Icon, label, value, tone }) {
  const iconTone =
    tone === "emerald"
      ? "bg-emerald-50 text-emerald-700"
      : "bg-blue-50 text-blue-700";
  return (
    <article className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <span className={`grid size-11 place-items-center rounded-xl ${iconTone}`}>
        <Icon size={20} aria-hidden="true" />
      </span>
      <div>
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
          {value}
        </p>
      </div>
    </article>
  );
}

function FormField({
  label,
  name,
  value,
  onChange,
  type = "text",
  required = false,
  autoComplete,
}) {
  return (
    <label className="block text-sm font-medium text-slate-700" htmlFor={name}>
      {label}
      {required && <span className="ml-1 text-rose-600">*</span>}
      <input
        autoComplete={autoComplete}
        className="mt-1.5 block box-border min-w-0 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
        id={name}
        name={name}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        type={type}
        value={value}
      />
    </label>
  );
}

function ModalHeader({ title, onClose, disabled = false }) {
  const titleId =
    title === "Add Supervisor" ? "add-supervisor-title" : "supervisor-profile-title";
  return (
    <header className="flex items-center justify-between gap-4 border-b border-slate-100 px-6 py-5">
      <h2 className="m-0 text-xl font-bold text-slate-900" id={titleId}>
        {title}
      </h2>
      <button
        className="grid size-9 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:opacity-50"
        type="button"
        aria-label="Close dialog"
        disabled={disabled}
        onClick={onClose}
      >
        <X size={18} />
      </button>
    </header>
  );
}

function ProfileDetail({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-2 break-words text-sm font-medium capitalize text-slate-800">
        {value}
      </dd>
    </div>
  );
}

export default Supervisor;
