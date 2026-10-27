import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import {
  AlertCircle,
  Building2,
  Check,
  Eye,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import "../../styles/tailwind.css";
import { useAuth } from "../../context/useAuth";
import { db } from "../../services/firebase";
import { deleteAccountPermanently } from "../../services/accountManagementService";
import {
  assignStudentsToSupervisor,
  unassignStudent,
} from "../../services/supervisorAssignmentService";
import { withoutArchived } from "../../services/recordState";
import { createManagedUser } from "../../services/userManagementSevice";

const emptyForm = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  studentRecordIds: [],
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
  const [studentLoadError, setStudentLoadError] = useState("");
  const [companyLoadError, setCompanyLoadError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [createdAccount, setCreatedAccount] = useState(null);
  const [notice, setNotice] = useState(null);
  const [manageSelection, setManageSelection] = useState([]);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState("");

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
          withoutArchived(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
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
        setStudents(withoutArchived(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))));
        studentsLoaded = true;
        updateReferenceLoading();
        setStudentLoadError("");
      },
      (snapshotError) => {
        console.error("Unable to load coordinator students:", snapshotError);
        setStudentLoadError(`Assigned students could not be loaded (${snapshotError.code || "unknown error"}).`);
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
        setCompanyLoadError("");
      },
      (snapshotError) => {
        console.error("Unable to load partner companies:", snapshotError);
        setCompanyLoadError(`Partner companies could not be loaded (${snapshotError.code || "unknown error"}).`);
        companiesLoaded = true;
        updateReferenceLoading();
      },
    );
    return () => {
      unsubscribeStudents();
      unsubscribeCompanies();
    };
  }, [user?.role, user?.uid]);

  const supervisorIds = useMemo(
    () => new Set(supervisors.map((supervisor) => supervisor.id)),
    [supervisors],
  );
  const hasSupervisorAssignment = (student) =>
    Boolean(student.supervisorUid && supervisorIds.has(student.supervisorUid));
  const studentsOf = (supervisor) =>
    students.filter((student) => student.supervisorUid === supervisor.id);
  const unassignedStudents = students.filter((student) => !hasSupervisorAssignment(student));

  const visibleSupervisors = useMemo(() => {
    const term = search.trim().toLowerCase();
    return supervisors
      .filter((supervisor) => {
        const fullName = displayName(supervisor);
        const company = companies.find((item) => item.id === supervisor.partnerCompanyId);
        const companyLabel = company
          ? companyName(company)
          : supervisor.company || "";
        const matchesSearch =
          !term ||
          `${fullName} ${companyLabel}`.toLowerCase().includes(term);
        const status = String(supervisor.status || "ACTIVE").toUpperCase();
        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "active" && status === "ACTIVE") ||
          (statusFilter === "inactive" && status !== "ACTIVE");
        return (
          matchesSearch &&
          matchesStatus
        );
      })
      .sort((a, b) => displayName(a).localeCompare(displayName(b)));
  }, [companies, search, statusFilter, supervisors]);

  const activeCount = supervisors.filter(
    (supervisor) => String(supervisor.status || "ACTIVE").toUpperCase() === "ACTIVE",
  ).length;
  const referenceError = [studentLoadError, companyLoadError]
    .filter(Boolean)
    .join(" ");

  const openAddModal = () => {
    setForm(emptyForm);
    setFormError("");
    setModal({ type: "add" });
  };

  const openEditModal = (supervisor) => {
    const linkedCompany = companies.find(
      (company) => company.id === supervisor.partnerCompanyId,
    );
    setForm({
      ...emptyForm,
      firstName: supervisor.firstName || "",
      lastName: supervisor.lastName || "",
      phone: supervisor.phone || "",
      partnerCompanyId: supervisor.partnerCompanyId || "",
      company: supervisor.company || (linkedCompany ? companyName(linkedCompany) : ""),
      position: supervisor.position || "",
    });
    setFormError("");
    setModalError("");
    setModal({ type: "edit", supervisorId: supervisor.id });
  };

  const closeModal = () => {
    if (saving || busy) return;
    setModal(null);
    setFormError("");
    setModalError("");
  };

  const openManageModal = (supervisor) => {
    setManageSelection([]);
    setModalError("");
    setModal({ type: "manage", supervisorId: supervisor.id });
  };

  const toggleId = (list, id) =>
    list.includes(id) ? list.filter((item) => item !== id) : [...list, id];

  const addStudentsToSupervisor = async (supervisor) => {
    if (busy || manageSelection.length === 0) return;
    setBusy(true);
    setModalError("");
    try {
      const count = await assignStudentsToSupervisor({
        coordinator: user,
        supervisor,
        studentIds: manageSelection,
      });
      setManageSelection([]);
      setNotice({ type: "success", text: `${count} student${count === 1 ? "" : "s"} assigned to ${displayName(supervisor)}.` });
    } catch (error) {
      console.error("Unable to assign students:", error);
      setModalError(error.message || "Students could not be assigned.");
    } finally {
      setBusy(false);
    }
  };

  const removeStudent = async (student) => {
    if (busy) return;
    setBusy(true);
    setModalError("");
    try {
      await unassignStudent({ coordinator: user, student });
      setNotice({ type: "success", text: `${studentName(student)} was removed from the supervisor.` });
    } catch (error) {
      console.error("Unable to remove the student assignment:", error);
      setModalError(error.message || "The student could not be removed.");
    } finally {
      setBusy(false);
    }
  };

  const reassignStudent = async (student, targetSupervisor) => {
    if (busy || !targetSupervisor) return;
    setBusy(true);
    setModalError("");
    try {
      await assignStudentsToSupervisor({
        coordinator: user,
        supervisor: targetSupervisor,
        studentIds: [student.id],
      });
      setNotice({ type: "success", text: `${studentName(student)} was reassigned to ${displayName(targetSupervisor)}.` });
    } catch (error) {
      console.error("Unable to reassign the student:", error);
      setModalError(error.message || "The student could not be reassigned.");
    } finally {
      setBusy(false);
    }
  };

  const deleteSupervisor = async (supervisor) => {
    if (busy) return;
    setBusy(true);
    setModalError("");
    try {
      await deleteAccountPermanently({ targetType: "user", targetId: supervisor.id });
      setModal(null);
      setNotice({ type: "success", text: `${displayName(supervisor)} was deleted.` });
    } catch (error) {
      console.error("Unable to delete the supervisor:", error);
      setModalError(error.message || "The supervisor could not be deleted.");
    } finally {
      setBusy(false);
    }
  };

  const addSupervisor = async (event) => {
    event.preventDefault();
    if (saving) return;
    setFormError("");
    setCreatedAccount(null);
    setNotice(null);

    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    const email = form.email.trim().toLowerCase();
    const selected = form.studentRecordIds
      .map((id) => students.find((item) => item.id === id))
      .filter(Boolean);
    const company = form.company.trim();
    const matchedCompany = companies.find((item) =>
      companyName(item).trim().toLowerCase() === company.toLowerCase(),
    );
    if (!firstName || !lastName || !email || selected.length === 0 || !company || !user?.department) {
      setFormError("Complete the required fields and select at least one assigned student and a partner company.");
      return;
    }
    if (selected.some((student) => student.coordinatorUid !== user.uid)) {
      setFormError("You can only assign supervisors to students in your department.");
      return;
    }
    if (selected.some(hasSupervisorAssignment)) {
      setFormError("One of the selected students already has an assigned supervisor.");
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
        assignedStudentRecordIds: selected.map((student) => student.id),
        partnerCompanyId: matchedCompany?.id || "",
        company,
        position: form.position,
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

  const updateSupervisor = async (event) => {
    event.preventDefault();
    if (saving || modal?.type !== "edit") return;
    setFormError("");

    const supervisor = supervisors.find(
      (item) => item.id === modal.supervisorId,
    );
    if (!supervisor || supervisor.role !== "supervisor") {
      setFormError("This supervisor account is no longer available.");
      return;
    }

    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    const phone = form.phone.trim();
    const company = form.company.trim();
    if (!firstName || !lastName || !company) {
      setFormError("Enter the supervisor's name and partner company.");
      return;
    }

    const matchedCompany =
      companies.find(
        (item) =>
          companyName(item).trim().toLowerCase() === company.toLowerCase(),
      ) ||
      companies.find((item) => item.id === form.partnerCompanyId);
    const assignedStudents = studentsOf(supervisor);
    const supervisorName = `${firstName} ${lastName}`;
    setSaving(true);
    try {
      await runTransaction(db, async (transaction) => {
        const supervisorRef = doc(db, "users", supervisor.id);
        const studentRefs = assignedStudents.map((student) =>
          doc(db, "students", student.id),
        );
        const snapshots = await Promise.all([
          transaction.get(supervisorRef),
          ...studentRefs.map((studentRef) => transaction.get(studentRef)),
        ]);
        const currentSupervisor = snapshots[0];
        if (
          !currentSupervisor.exists() ||
          currentSupervisor.data().role !== "supervisor" ||
          currentSupervisor.data().department !== user.department
        ) {
          throw new Error("You can only edit supervisors in your department.");
        }

        transaction.update(supervisorRef, {
          firstName,
          lastName,
          phone,
          position: form.position.trim(),
          company,
          partnerCompanyId: matchedCompany?.id || null,
          updatedAt: serverTimestamp(),
        });

        snapshots.slice(1).forEach((snapshot, index) => {
          if (!snapshot.exists()) {
            throw new Error("An assigned student record could not be found.");
          }
          const student = snapshot.data();
          if (student.coordinatorUid !== user.uid) {
            throw new Error("You can only edit students in your own roster.");
          }
          if (student.supervisorUid === supervisor.id) {
            transaction.update(studentRefs[index], {
              supervisorName,
              company,
              partnerCompanyId: matchedCompany?.id || null,
              updatedAt: serverTimestamp(),
            });
          }
        });
      });

      setModal(null);
      setNotice({
        type: "success",
        text: `${supervisorName}'s supervisor details were updated.`,
      });
    } catch (updateError) {
      console.error("Unable to update supervisor account:", updateError);
      setFormError(
        updateError.message || "Supervisor details could not be updated.",
      );
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

        {notice && (
          <section
            className={`mb-6 flex items-center justify-between gap-4 rounded-xl border p-4 text-sm ${notice.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}
            role="status"
          >
            <span>{notice.text}</span>
            <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)}><X size={16} /></button>
          </section>
        )}

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
        {(studentLoadError || companyLoadError) && (
          <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">
            {[studentLoadError, companyLoadError].filter(Boolean).join(" ")}
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
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <label className="flex w-full items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-slate-400 transition focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-100 sm:w-72">
                <Search size={17} aria-hidden="true" />
                <span className="sr-only">Search supervisors by name or company</span>
                <input
                  className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:ring-0"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search name or company"
                />
              </label>
              <label className="sr-only" htmlFor="supervisor-status-filter">
                Filter supervisors by status
              </label>
              <select
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                id="supervisor-status-filter"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
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
                  {search || statusFilter !== "all"
                    ? "No supervisors match these filters"
                    : "No supervisors added yet"}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {search || statusFilter !== "all"
                    ? "Adjust the search or status filter and try again."
                    : "Add a supervisor to create their system account."}
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[940px] border-collapse text-left">
                <thead>
                  <tr className="bg-slate-50/80">
                    <th className="px-6 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                      Supervisor Name
                    </th>
                    <th className="px-6 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                      Email Address
                    </th>
                    <th className="px-6 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                      Partner Company
                    </th>
                    <th className="px-6 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                      Assigned Students
                    </th>
                    <th className="px-6 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                      Status
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">
                      Actions
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
                    const assignedStudents = studentsOf(supervisor);
                    const company =
                      companies.find((item) => item.id === supervisor.partnerCompanyId);
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
                            <span className="min-w-0">
                              <strong className="block whitespace-nowrap text-sm font-semibold text-slate-800">
                                {name}
                              </strong>
                              {(supervisor.position || company || supervisor.company) && (
                                <span className="mt-1 block max-w-48 truncate text-xs text-slate-500">
                                  {[supervisor.position, company ? companyName(company) : supervisor.company]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </span>
                              )}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          {supervisor.email || "—"}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          <span className="inline-flex items-center gap-2">
                            <Building2 size={15} className="shrink-0 text-slate-400" aria-hidden="true" />
                            {company ? companyName(company) : supervisor.company || "—"}
                          </span>
                        </td>
                        <td className="px-6 py-3">
                          <div className="min-w-44">
                            <span className="mb-2 inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                              {assignedStudents.length} student{assignedStudents.length === 1 ? "" : "s"}
                            </span>
                            {assignedStudents.length > 0 ? (
                              <ul className="m-0 list-none space-y-1 p-0">
                                {assignedStudents.slice(0, 2).map((student) => (
                                  <li className="truncate text-xs text-slate-700" key={student.id}>
                                    {studentName(student)}
                                    <span className="ml-1 text-slate-400">
                                      · {student.studentId || student.id}
                                    </span>
                                  </li>
                                ))}
                                {assignedStudents.length > 2 && (
                                  <li className="text-xs font-medium text-slate-500">
                                    +{assignedStudents.length - 2} more
                                  </li>
                                )}
                              </ul>
                            ) : (
                              <p className="m-0 text-xs text-slate-400">No students assigned</p>
                            )}
                          </div>
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
                          <div className="inline-flex gap-2">
                            <button
                              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100"
                              type="button"
                              onClick={() => setModal({ type: "view", supervisor })}
                              aria-label={`View profile for ${name}`}
                              title="View profile"
                            >
                              <Eye size={15} aria-hidden="true" />
                              View
                            </button>
                            <button
                              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100"
                              type="button"
                              onClick={() => openManageModal(supervisor)}
                              aria-label={`Manage students of ${name}`}
                              title="Manage assigned students"
                            >
                              <UsersRound size={15} aria-hidden="true" />
                              Students
                            </button>
                            <button
                              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100"
                              type="button"
                              onClick={() => openEditModal(supervisor)}
                              aria-label={`Edit ${name}`}
                              title="Edit supervisor"
                            >
                              <Pencil size={14} aria-hidden="true" />
                              Edit
                            </button>
                            <button
                              className="inline-flex items-center rounded-lg border border-rose-200 bg-white px-2.5 py-2 text-rose-700 shadow-sm transition hover:bg-rose-50 focus:outline-none focus:ring-4 focus:ring-rose-100"
                              type="button"
                              onClick={() => { setModalError(""); setModal({ type: "delete", supervisor }); }}
                              aria-label={`Delete ${name}`}
                              title="Delete supervisor"
                            >
                              <Trash2 size={15} aria-hidden="true" />
                            </button>
                          </div>
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
              <fieldset className="text-sm font-medium text-slate-700">
                <legend>Assigned OJT students <span className="text-rose-600">*</span> <span className="font-normal text-slate-500">({form.studentRecordIds.length} selected)</span></legend>
                <ul className="mt-1.5 max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-300">
                  {referenceLoading && <li className="px-3 py-2 text-slate-500">Loading assigned students...</li>}
                  {!referenceLoading && unassignedStudents.length === 0 && <li className="px-3 py-2 text-slate-500">No unassigned students available.</li>}
                  {unassignedStudents.map((student) => (
                    <li key={student.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2 font-normal">
                        <input
                          type="checkbox"
                          disabled={saving}
                          checked={form.studentRecordIds.includes(student.id)}
                          onChange={() => {
                            const company = student.company || student.partnerCompany || student.companyName || "";
                            const matchedCompany = companies.find((item) => companyName(item).toLowerCase() === company.trim().toLowerCase());
                            setForm((current) => ({
                              ...current,
                              studentRecordIds: toggleId(current.studentRecordIds, student.id),
                              ...(company && !current.company ? { company } : {}),
                              ...(!current.company && company ? { partnerCompanyId: matchedCompany?.id || "" } : {}),
                            }));
                          }}
                        />
                        <span>{studentName(student)} <span className="text-xs text-slate-500">· {student.studentId || student.studentID || student.id}</span></span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
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
                  disabled={saving || referenceLoading || Boolean(referenceError) || unassignedStudents.length === 0}
                >
                  <Plus size={16} />
                  {saving ? "Creating…" : "Create Supervisor"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {modal?.type === "edit" && (
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
            className="max-h-[90svh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl"
            role="dialog"
          >
            <ModalHeader
              title="Edit Supervisor"
              onClose={closeModal}
              disabled={saving}
            />
            <form className="space-y-4 p-6" onSubmit={updateSupervisor}>
              <p className="text-sm text-slate-500">
                Update the supervisor profile and partner company. Assigned students will retain their supervisor and receive the updated company details.
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
                  name="editSupervisorFirstName"
                  value={form.firstName}
                  onChange={(value) => setForm((current) => ({ ...current, firstName: value }))}
                  required
                  autoComplete="given-name"
                />
                <FormField
                  label="Last name"
                  name="editSupervisorLastName"
                  value={form.lastName}
                  onChange={(value) => setForm((current) => ({ ...current, lastName: value }))}
                  required
                  autoComplete="family-name"
                />
              </div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="edit-supervisor-email">
                Email address
                <input
                  className="mt-1.5 block box-border min-w-0 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500"
                  id="edit-supervisor-email"
                  type="email"
                  value={supervisors.find((item) => item.id === modal.supervisorId)?.email || ""}
                  readOnly
                />
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Sign-in email changes require updating the Firebase Authentication account.
                </span>
              </label>
              <FormField
                label="Phone number"
                name="editSupervisorPhone"
                type="tel"
                value={form.phone}
                onChange={(value) => setForm((current) => ({ ...current, phone: value }))}
                autoComplete="tel"
              />
              <FormField
                label="Position"
                name="editSupervisorPosition"
                value={form.position}
                onChange={(value) => setForm((current) => ({ ...current, position: value }))}
                autoComplete="organization-title"
              />
              <label className="block text-sm font-medium text-slate-700" htmlFor="edit-supervisor-company">
                Partner company <span className="text-rose-600">*</span>
                <input
                  className="mt-1.5 block box-border min-w-0 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  id="edit-supervisor-company"
                  list="edit-partner-company-suggestions"
                  required
                  disabled={saving}
                  value={form.company}
                  onChange={(event) => {
                    const company = event.target.value;
                    const matchedCompany = companies.find(
                      (item) =>
                        companyName(item).trim().toLowerCase() ===
                        company.trim().toLowerCase(),
                    );
                    setForm((current) => ({
                      ...current,
                      company,
                      partnerCompanyId: matchedCompany?.id || "",
                    }));
                  }}
                  placeholder="Type partner company"
                />
                <datalist id="edit-partner-company-suggestions">
                  {companies.map((company) => (
                    <option key={company.id} value={companyName(company)} />
                  ))}
                </datalist>
              </label>
              <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
                <button
                  className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60"
                  type="submit"
                  disabled={saving}
                >
                  {saving ? "Saving…" : "Save changes"}
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
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5 sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Assigned students ({studentsOf(modal.supervisor).length})
                </dt>
                {studentsOf(modal.supervisor).length > 0 ? (
                  <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                    {studentsOf(modal.supervisor).map((student) => (
                      <li
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2"
                        key={student.id}
                      >
                        <strong className="block text-sm font-semibold text-slate-800">
                          {studentName(student)}
                        </strong>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {student.studentId || student.id} · {student.course || "No course"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <dd className="mt-2 text-sm font-medium text-slate-600">
                    No students assigned
                  </dd>
                )}
              </div>
              <ProfileDetail
                label="Partner company"
                value={
                  modal.supervisor.company ||
                  (modal.supervisor.partnerCompanyId
                    ? companyName(
                        companies.find(
                          (company) =>
                            company.id === modal.supervisor.partnerCompanyId,
                        ) || {},
                      ) || "Not assigned"
                    : "Not assigned")
                }
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

      {modal?.type === "delete" && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4 backdrop-blur-[2px]" role="presentation">
          <section aria-modal="true" className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl" role="alertdialog">
            <ModalHeader title="Delete supervisor?" onClose={closeModal} disabled={busy} />
            <div className="space-y-3 p-6 text-sm text-slate-600">
              <p>
                This permanently deletes <strong>{displayName(modal.supervisor)}</strong> and their login account.
                {studentsOf(modal.supervisor).length > 0 && ` Their ${studentsOf(modal.supervisor).length} assigned student(s) will become unassigned.`}
              </p>
              {modalError && <p className="text-rose-700" role="alert">{modalError}</p>}
              <div className="flex justify-end gap-3 pt-2">
                <button className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60" type="button" onClick={closeModal} disabled={busy}>Cancel</button>
                <button className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-wait disabled:opacity-60" type="button" onClick={() => deleteSupervisor(modal.supervisor)} disabled={busy}>
                  <Trash2 size={16} aria-hidden="true" />
                  {busy ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {modal?.type === "manage" && (() => {
        const supervisor = supervisors.find((item) => item.id === modal.supervisorId);
        if (!supervisor) return null;
        const assigned = studentsOf(supervisor);
        const others = supervisors.filter((item) => item.id !== supervisor.id);
        return (
          <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4 backdrop-blur-[2px]" role="presentation">
            <section aria-modal="true" className="max-h-[90svh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl" role="dialog">
              <ModalHeader title={`Students of ${displayName(supervisor)}`} onClose={closeModal} disabled={busy} />
              <div className="space-y-5 p-6 text-sm">
                {modalError && <p className="text-rose-700" role="alert">{modalError}</p>}
                <div>
                  <h3 className="mb-2 font-semibold text-slate-800">Assigned students ({assigned.length})</h3>
                  {assigned.length === 0 ? (
                    <p className="text-slate-500">No students assigned yet.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                      {assigned.map((student) => (
                        <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2" key={student.id}>
                          <span>
                            <strong className="text-slate-800">{studentName(student)}</strong>
                            <span className="block text-xs text-slate-500">{student.studentId || student.id} · {student.course || "No course"} · {student.company || supervisor.company || "No company"}</span>
                          </span>
                          <span className="flex items-center gap-2">
                            {others.length > 0 && (
                              <select
                                aria-label={`Reassign ${studentName(student)}`}
                                className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
                                disabled={busy}
                                value=""
                                onChange={(event) => reassignStudent(student, others.find((item) => item.id === event.target.value))}
                              >
                                <option value="">Reassign to…</option>
                                {others.map((item) => <option key={item.id} value={item.id}>{displayName(item)}</option>)}
                              </select>
                            )}
                            <button className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60" type="button" disabled={busy} onClick={() => removeStudent(student)}>Remove</button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h3 className="mb-2 font-semibold text-slate-800">Add students</h3>
                  {unassignedStudents.length === 0 ? (
                    <p className="text-slate-500">All of your students already have a supervisor.</p>
                  ) : (
                    <ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                      {unassignedStudents.map((student) => (
                        <li key={student.id}>
                          <label className="flex cursor-pointer items-center gap-3 px-3 py-2">
                            <input type="checkbox" checked={manageSelection.includes(student.id)} disabled={busy} onChange={() => setManageSelection((current) => toggleId(current, student.id))} />
                            <span>{studentName(student)} <span className="text-xs text-slate-500">· {student.studentId || student.id} · {student.course || "No course"}</span></span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-3 flex justify-end">
                    <button className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60" type="button" disabled={busy || manageSelection.length === 0} onClick={() => addStudentsToSupervisor(supervisor)}>
                      <Plus size={16} aria-hidden="true" />
                      {busy ? "Saving…" : `Assign ${manageSelection.length || ""} selected`}
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        );
      })()}
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
