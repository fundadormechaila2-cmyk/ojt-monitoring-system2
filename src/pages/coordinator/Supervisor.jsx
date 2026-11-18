import { useEffect, useMemo, useRef, useState } from "react";
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
  ChevronDown,
  Eye,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import "../../styles/tailwind.css";
import "../../styles/supervisor-directory.css";
import { useAuth } from "../../context/useAuth";
import { db } from "../../services/firebase";
import {
  assignStudentsToSupervisor,
  unassignStudent,
} from "../../services/supervisorAssignmentService";
import { withoutArchived } from "../../services/recordState";
import {
  createSupervisorAccount,
  resendSupervisorAccountNotification,
} from "../../services/userManagementSevice";
import { syncRoleAccount } from "../../services/accountCollections";
import { supervisorDirectoryQuery } from "../../services/supervisorDirectoryQuery";
import DepartmentBadge from "../../components/DepartmentBadge";
import RowActionsMenu from "../../components/RowActionsMenu";
import { DataCard, PageHero, StatusBadge } from "../../components/WorkspaceUI";
import { recordDepartmentId } from "../../constants/departments";

const emptyForm = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  studentRecordIds: [],
  partnerCompanyId: "",
  company: "",
  position: "",
  schoolYear: "",
};

function currentAcademicYear() {
  const now = new Date();
  const startYear =
    now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
  return `${startYear}-${startYear + 1}`;
}

function displayName(supervisor) {
  return (
    `${supervisor.firstName || ""} ${supervisor.lastName || ""}`.trim() ||
    supervisor.fullName ||
    supervisor.email ||
    "Unnamed supervisor"
  );
}

function studentName(student) {
  return (
    student.name ||
    student.fullName ||
    `${student.firstName || ""} ${student.lastName || ""}`.trim() ||
    student.email ||
    student.studentId ||
    student.id
  );
}

function companyName(company) {
  return (
    company.companyName ||
    company.name ||
    company.businessName ||
    company.company ||
    company.email ||
    company.id
  );
}

function formatDate(value) {
  if (!value) return "—";
  const date =
    typeof value.toDate === "function" ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date);
}

function Supervisor() {
  const { user } = useAuth();
  const departmentId = recordDepartmentId(user);
  const [supervisors, setSupervisors] = useState([]);
  const [students, setStudents] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [schoolYearRecords, setSchoolYearRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [referenceLoading, setReferenceLoading] = useState(true);
  const [studentLoadError, setStudentLoadError] = useState("");
  const [companyLoadError, setCompanyLoadError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [schoolYearFilter, setSchoolYearFilter] = useState("");
  const [openActionsId, setOpenActionsId] = useState(null);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const creatingSupervisor = useRef(false);
  const [notice, setNotice] = useState(null);
  const [manageSelection, setManageSelection] = useState([]);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState("");

  useEffect(() => {
    if (user?.role !== "coordinator" || !user.uid || !departmentId || !user.department) {
      return undefined;
    }
    const supervisorsQuery = supervisorDirectoryQuery(db, user.department);

    return onSnapshot(
      supervisorsQuery,
      (snapshot) => {
        setSupervisors(
          snapshot.docs
            .map((item) => ({ id: item.id, ...item.data() }))
            .filter((item) => recordDepartmentId(item) === departmentId),
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
  }, [departmentId, user?.department, user?.role, user?.uid]);

  useEffect(() => {
    if (user?.role !== "coordinator") return undefined;
    return onSnapshot(
      collection(db, "schoolYears"),
      (snapshot) => {
        setSchoolYearRecords(
          snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
        );
      },
      (snapshotError) => {
        console.error("Unable to load school years:", snapshotError);
        setLoadError(
          `School years could not be loaded (${snapshotError.code || "unknown error"}).`,
        );
      },
    );
  }, [user?.role]);

  useEffect(() => {
    if (user?.role !== "coordinator" || !user.uid || !departmentId) {
      return undefined;
    }

    let studentsLoaded = false;
    let companiesLoaded = false;
    const updateReferenceLoading = () => {
      setReferenceLoading(!(studentsLoaded && companiesLoaded));
    };
    const unsubscribeStudents = onSnapshot(
      query(
        collection(db, "students"),
        where("coordinatorUid", "==", user.uid),
        where("departmentId", "==", departmentId),
      ),
      (snapshot) => {
        setStudents(
          withoutArchived(
            snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
          ),
        );
        studentsLoaded = true;
        updateReferenceLoading();
        setStudentLoadError("");
      },
      (snapshotError) => {
        console.error("Unable to load coordinator students:", snapshotError);
        setStudentLoadError(
          `Assigned students could not be loaded (${snapshotError.code || "unknown error"}).`,
        );
        studentsLoaded = true;
        updateReferenceLoading();
      },
    );
    const unsubscribeCompanies = onSnapshot(
      collection(db, "partnerCompanies"),
      (snapshot) => {
        setCompanies(
          snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
        );
        companiesLoaded = true;
        updateReferenceLoading();
        setCompanyLoadError("");
      },
      (snapshotError) => {
        console.error("Unable to load partner companies:", snapshotError);
        setCompanyLoadError(
          `Partner companies could not be loaded (${snapshotError.code || "unknown error"}).`,
        );
        companiesLoaded = true;
        updateReferenceLoading();
      },
    );
    return () => {
      unsubscribeStudents();
      unsubscribeCompanies();
    };
  }, [user?.role, user?.uid, departmentId]);

  const supervisorIds = useMemo(
    () => new Set(supervisors.map((supervisor) => supervisor.id)),
    [supervisors],
  );
  const hasSupervisorAssignment = (student) =>
    Boolean(
      student.supervisorUid &&
      supervisorIds.has(student.supervisorUid) &&
      (!student.schoolYear ||
        student.supervisorSchoolYear === student.schoolYear ||
        (!student.supervisorSchoolYear &&
          supervisors.find((item) => item.id === student.supervisorUid)
            ?.schoolYear === student.schoolYear)),
    );
  const studentsOf = (supervisor) =>
    students.filter((student) => student.supervisorUid === supervisor.id);
  const schoolYearOptions = useMemo(
    () =>
      [
        ...new Set([
          ...schoolYearRecords.map((item) => item.name).filter(Boolean),
          ...supervisors.map((item) => item.schoolYear).filter(Boolean),
          ...students.map((item) => item.schoolYear).filter(Boolean),
          currentAcademicYear(),
        ]),
      ].sort((a, b) => b.localeCompare(a)),
    [schoolYearRecords, students, supervisors],
  );
  const activeSchoolYearOptions = useMemo(() => {
    const active = schoolYearRecords
      .filter((item) => item.active !== false)
      .map((item) => item.name)
      .filter(Boolean);
    return [
      ...new Set([
        ...active,
        ...supervisors.map((item) => item.schoolYear).filter(Boolean),
        ...(!active.length ? [currentAcademicYear()] : []),
      ]),
    ].sort((a, b) => b.localeCompare(a));
  }, [schoolYearRecords, supervisors]);
  const currentSchoolYear =
    schoolYearRecords
      .filter((item) => item.active !== false)
      .map((item) => item.name)
      .sort((a, b) => b.localeCompare(a))[0] || currentAcademicYear();
  const effectiveSchoolYearFilter = schoolYearFilter || currentSchoolYear;
  const unassignedStudentsForYear = (schoolYear) =>
    students.filter(
      (student) =>
        !hasSupervisorAssignment(student) &&
        (!schoolYear ||
          !student.schoolYear ||
          student.schoolYear === schoolYear),
    );

  const visibleSupervisors = useMemo(() => {
    const term = search.trim().toLowerCase();
    return supervisors
      .filter((supervisor) => {
        const fullName = displayName(supervisor);
        const company = companies.find(
          (item) => item.id === supervisor.partnerCompanyId,
        );
        const companyLabel = company
          ? companyName(company)
          : supervisor.company || "";
        const matchesSearch =
          !term || `${fullName} ${companyLabel}`.toLowerCase().includes(term);
        const status = String(supervisor.status || "ACTIVE").toUpperCase();
        const archived =
          supervisor.isArchived === true || status === "ARCHIVED";
        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "active" &&
            !archived &&
            supervisor.isActive !== false &&
            status === "ACTIVE") ||
          (statusFilter === "inactive" &&
            !archived &&
            (supervisor.isActive === false || status !== "ACTIVE"));
        const matchesSchoolYear =
          effectiveSchoolYearFilter === "all" ||
          (supervisor.schoolYear || "") === effectiveSchoolYearFilter;
        return matchesSearch && matchesStatus && matchesSchoolYear;
      })
      .sort((a, b) => displayName(a).localeCompare(displayName(b)));
  }, [companies, effectiveSchoolYearFilter, search, statusFilter, supervisors]);

  const activeCount = supervisors.filter(
    (supervisor) =>
      supervisor.isArchived !== true &&
      supervisor.isActive !== false &&
      String(supervisor.status || "ACTIVE").toUpperCase() === "ACTIVE",
  ).length;
  const referenceError = [
    !departmentId
      ? "Your coordinator account has no recognized department. Ask an administrator to assign one in OJT Coordinators."
      : "",
    studentLoadError,
    companyLoadError,
  ]
    .filter(Boolean)
    .join(" ");

  const openAddModal = () => {
    setForm({ ...emptyForm, schoolYear: currentSchoolYear });
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
      company:
        supervisor.company || (linkedCompany ? companyName(linkedCompany) : ""),
      position: supervisor.position || "",
      schoolYear: supervisor.schoolYear || currentSchoolYear,
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
        schoolYear: supervisor.schoolYear || currentSchoolYear,
      });
      setManageSelection([]);
      setNotice({
        type: "success",
        text: `${count} student${count === 1 ? "" : "s"} assigned to ${displayName(supervisor)}.`,
      });
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
      setNotice({
        type: "success",
        text: `${studentName(student)} was removed from the supervisor.`,
      });
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
        schoolYear: targetSupervisor.schoolYear || currentSchoolYear,
      });
      setNotice({
        type: "success",
        text: `${studentName(student)} was reassigned to ${displayName(targetSupervisor)}.`,
      });
    } catch (error) {
      console.error("Unable to reassign the student:", error);
      setModalError(error.message || "The student could not be reassigned.");
    } finally {
      setBusy(false);
    }
  };

  const resendCredentials = async (supervisor) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await resendSupervisorAccountNotification(supervisor.id);
      setNotice({
        type: result.emailStatus === "Sent" ? "success" : "error",
        text: result.emailStatus === "Sent"
          ? `Password setup email requested for ${result.email}.`
          : `The password setup email ${result.emailStatus === "Failed" ? "could not be sent" : "could not be confirmed"}. Contact an administrator if retry is unavailable.`,
      });
    } catch (error) {
      console.error("Unable to resend supervisor setup email:", error);
      setNotice({ type: "error", text: error.message || "Unable to resend the setup email." });
    } finally {
      setBusy(false);
    }
  };

  const addSupervisor = async (event) => {
    event.preventDefault();
    if (saving || creatingSupervisor.current) return;
    setFormError("");
    setNotice(null);

    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    const email = form.email.trim().toLowerCase();
    const selected = form.studentRecordIds
      .map((id) => students.find((item) => item.id === id))
      .filter(Boolean);
    const company = form.company.trim();
    const schoolYear = form.schoolYear.trim();
    const matchedCompany = companies.find(
      (item) =>
        companyName(item).trim().toLowerCase() === company.toLowerCase(),
    );
    if (
      !firstName ||
      !lastName ||
      !email ||
      selected.length === 0 ||
      !company ||
      !schoolYear ||
      !user?.department
    ) {
      setFormError(
        "Complete the required fields, including School Year, and select at least one assigned student and a partner company.",
      );
      return;
    }
    if (selected.some((student) => student.coordinatorUid !== user.uid)) {
      setFormError(
        "You can only assign supervisors to students in your department.",
      );
      return;
    }
    if (selected.some(hasSupervisorAssignment)) {
      setFormError(
        "One of the selected students already has an assigned supervisor.",
      );
      return;
    }
    if (!/^[^\s@]+@gmail\.com$/.test(email)) {
      setFormError("Enter a valid Gmail address.");
      return;
    }

    creatingSupervisor.current = true;
    setSaving(true);
    try {
      const existingSupervisor = supervisors.find(
        (item) =>
          String(item.email || "")
            .trim()
            .toLowerCase() === email,
      );
      if (existingSupervisor) {
        await assignStudentsToSupervisor({
          coordinator: user,
          supervisor: existingSupervisor,
          studentIds: selected.map((student) => student.id),
          schoolYear,
          restoreSupervisor:
            existingSupervisor.isArchived === true ||
            String(existingSupervisor.status || "").toUpperCase() ===
              "ARCHIVED",
        });
        setNotice({
          type: "success",
          text: `${displayName(existingSupervisor)}'s existing account was reassigned for School Year ${schoolYear}; no duplicate account was created.`,
        });
        setModal(null);
        setForm(emptyForm);
        return;
      }
      const account = await createSupervisorAccount({
        firstName,
        lastName,
        email,
        phone: form.phone.trim(),
        assignedStudentRecordIds: selected.map((student) => student.id),
        partnerCompanyId: matchedCompany?.id || "",
        company,
        position: form.position,
        schoolYear,
      });
      setNotice({
        type: account.emailStatus === "Sent" ? "success" : "error",
        text: account.emailStatus === "Sent"
          ? `Supervisor account created for ${firstName} ${lastName}. A password setup email was requested for ${account.email}.`
          : `The supervisor account was created, but the password setup email ${account.emailStatus === "Failed" ? "could not be sent" : "could not be confirmed"}. Do not create another account; ${account.emailStatus === "Failed" ? "use Retry email in the directory" : "contact an administrator for assistance"}.`,
      });
      setModal(null);
      setForm(emptyForm);
    } catch (createError) {
      console.error("Unable to create supervisor account:", createError);
      setFormError(
        createError.message ||
          "Unable to create supervisor account and assignment.",
      );
    } finally {
      creatingSupervisor.current = false;
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
    const schoolYear = form.schoolYear.trim();
    if (!firstName || !lastName || !company || !schoolYear) {
      setFormError(
        "Enter the supervisor's name, partner company, and School Year.",
      );
      return;
    }

    const matchedCompany =
      companies.find(
        (item) =>
          companyName(item).trim().toLowerCase() === company.toLowerCase(),
      ) || companies.find((item) => item.id === form.partnerCompanyId);
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
          schoolYear,
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

      await syncRoleAccount(supervisor.id).catch((syncError) =>
        console.warn("Unable to sync the supervisor account profile:", syncError),
      );
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
        <PageHero
          eyebrow="COORDINATOR WORKSPACE · SUPERVISORS"
          title="Supervisors"
          subtitle="Manage supervisor accounts and student assignments."
        />
        <p className="text-sm text-rose-700" role="alert">
          A coordinator profile with an assigned department is required.
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-full bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <PageHero
          eyebrow="COORDINATOR WORKSPACE · SUPERVISORS"
          title="Supervisors"
          subtitle={`Manage supervisor accounts and student assignments. Current school year: ${currentSchoolYear}.`}
          action={
            <button
              className="workspace-primary-button inline-flex w-fit items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition focus:outline-none focus:ring-4 focus:ring-blue-200"
              type="button"
              onClick={openAddModal}
            >
              <Plus size={17} aria-hidden="true" />
              Add Supervisor
            </button>
          }
        />

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
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setNotice(null)}
            >
              <X size={16} />
            </button>
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
          <div
            className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
            role="alert"
          >
            {referenceError}
          </div>
        )}

        <DataCard className="supervisor-directory">
          <div className="supervisor-directory-heading">
            <h2>Supervisor Directory</h2>
            <p>Supervisor user accounts registered in the system.</p>
          </div>
          <div className="supervisor-directory-filters">
            <label className="supervisor-directory-search">
              <Search size={18} aria-hidden="true" />
              <span className="sr-only">Search supervisors by name or company</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name or company"
              />
            </label>
            <div className="supervisor-directory-select">
              <label className="sr-only" htmlFor="supervisor-status-filter">Filter supervisors by status</label>
              <select id="supervisor-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <ChevronDown size={17} aria-hidden="true" />
            </div>
            <div className="supervisor-directory-select">
              <label className="sr-only" htmlFor="supervisor-school-year-filter">Filter supervisors by School Year</label>
              <select id="supervisor-school-year-filter" value={effectiveSchoolYearFilter} onChange={(event) => setSchoolYearFilter(event.target.value)}>
                <option value="all">All School Years</option>
                {schoolYearOptions.map((schoolYear) => (
                  <option key={schoolYear} value={schoolYear}>
                    {schoolYear}{schoolYear === currentSchoolYear ? " (Current)" : ""}
                  </option>
                ))}
              </select>
              <ChevronDown size={17} aria-hidden="true" />
            </div>
          </div>

          {loading ? (
            <div className="supervisor-directory-empty">Loading supervisors...</div>
          ) : visibleSupervisors.length === 0 ? (
            <div className="supervisor-directory-empty">
              <UserRound size={24} aria-hidden="true" />
              <strong>No supervisors match these filters</strong>
              <span>Adjust the search or filters and try again.</span>
            </div>
          ) : (
            <div className="supervisor-directory-grid">
              {visibleSupervisors.map((supervisor) => {
                const name = displayName(supervisor);
                const status = String(supervisor.status || "ACTIVE").toUpperCase();
                const archived = supervisor.isArchived === true || status === "ARCHIVED";
                const statusLabel = archived ? "Archived" : supervisor.isActive === false || status !== "ACTIVE" ? "Inactive" : "Active";
                const company = companies.find((item) => item.id === supervisor.partnerCompanyId);
                const photo = supervisor.photoURL || supervisor.photoUrl || supervisor.profilePhoto || supervisor.profileImage;
                return (
                  <article className="supervisor-directory-item" key={supervisor.id}>
                    <span className="supervisor-directory-avatar">
                      {photo ? <img src={photo} alt="" /> : <UserRound size={26} aria-hidden="true" />}
                    </span>
                    <div className="supervisor-directory-details">
                      <h3>{name}</h3>
                      <p>{company ? companyName(company) : supervisor.company || "No company assigned"}</p>
                      <StatusBadge value={statusLabel} tone={statusLabel === "Active" ? "success" : "neutral"} />
                      {supervisor.createdBy === user.uid && !supervisor.mustChangePassword && supervisor.accountNotificationStatus === "Failed" && (
                        <button className="supervisor-directory-retry" type="button" disabled={busy} onClick={() => resendCredentials(supervisor)}>
                          Retry email
                        </button>
                      )}
                    </div>
                    <RowActionsMenu
                      open={openActionsId === supervisor.id}
                      onOpenChange={(open) => setOpenActionsId(open ? supervisor.id : null)}
                      actions={[
                        { label: "View", icon: Eye, onSelect: () => setModal({ type: "view", supervisor }) },
                        { label: "Students", icon: UsersRound, onSelect: () => openManageModal(supervisor) },
                        { label: "Edit", icon: Pencil, onSelect: () => openEditModal(supervisor) },
                      ]}
                    />
                  </article>
                );
              })}
            </div>
          )}
          <footer className="supervisor-directory-footer">
            Showing {visibleSupervisors.length} of {supervisors.length} supervisors
          </footer>
        </DataCard>
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
                Create a new account or reassign an existing supervisor account.
                New accounts receive a password setup link by email.
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
              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor="supervisor-position"
              >
                Position
                <input
                  className="mt-1.5 block box-border min-w-0 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  id="supervisor-position"
                  value={form.position}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      position: event.target.value,
                    }))
                  }
                  autoComplete="organization-title"
                />
              </label>
              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor="supervisor-company"
              >
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
                    const matchedCompany = companies.find(
                      (item) =>
                        companyName(item).toLowerCase() ===
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
                <datalist id="partner-company-suggestions">
                  {companies.map((company) => (
                    <option key={company.id} value={companyName(company)} />
                  ))}
                </datalist>
              </label>
              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor="supervisor-school-year"
              >
                School Year <span className="text-rose-600">*</span>
                <select
                  className="mt-1.5 block box-border min-w-0 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  id="supervisor-school-year"
                  required
                  disabled={saving}
                  value={form.schoolYear}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      schoolYear: event.target.value,
                      studentRecordIds: [],
                    }))
                  }
                >
                  {activeSchoolYearOptions.map((schoolYear) => (
                    <option key={schoolYear} value={schoolYear}>
                      {schoolYear}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className="text-sm font-medium text-slate-700">
                <legend>
                  Assigned OJT students <span className="text-rose-600">*</span>{" "}
                  <span className="font-normal text-slate-500">
                    ({form.studentRecordIds.length} selected)
                  </span>
                </legend>
                <ul className="mt-1.5 max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-300">
                  {referenceLoading && (
                    <li className="px-3 py-2 text-slate-500">
                      Loading assigned students...
                    </li>
                  )}
                  {!referenceLoading &&
                    unassignedStudentsForYear(form.schoolYear).length === 0 && (
                      <li className="px-3 py-2 text-slate-500">
                        No unassigned students available for this School Year.
                      </li>
                    )}
                  {unassignedStudentsForYear(form.schoolYear).map((student) => (
                    <li key={student.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2 font-normal">
                        <input
                          type="checkbox"
                          disabled={saving}
                          checked={form.studentRecordIds.includes(student.id)}
                          onChange={() => {
                            const company =
                              student.company ||
                              student.partnerCompany ||
                              student.companyName ||
                              "";
                            const matchedCompany = companies.find(
                              (item) =>
                                companyName(item).toLowerCase() ===
                                company.trim().toLowerCase(),
                            );
                            setForm((current) => ({
                              ...current,
                              studentRecordIds: toggleId(
                                current.studentRecordIds,
                                student.id,
                              ),
                              ...(company && !current.company
                                ? { company }
                                : {}),
                              ...(!current.company && company
                                ? { partnerCompanyId: matchedCompany?.id || "" }
                                : {}),
                            }));
                          }}
                        />
                        <span>
                          {studentName(student)}{" "}
                          <span className="text-xs text-slate-500">
                            ·{" "}
                            {student.studentId ||
                              student.studentID ||
                              student.id}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="block font-medium text-slate-700">
                    Department
                  </span>
                  <DepartmentBadge value={user?.department || "Not assigned"} />
                </div>
                <div>
                  <span className="block font-medium text-slate-700">
                    Account status
                  </span>
                  <span className="text-slate-500">Active</span>
                </div>
              </div>
              {referenceError && (
                <p className="text-sm text-rose-700" role="alert">
                  {referenceError}
                </p>
              )}
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
                  disabled={
                    saving ||
                    referenceLoading ||
                    Boolean(referenceError) ||
                    unassignedStudentsForYear(form.schoolYear).length === 0
                  }
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
                Update the supervisor profile and partner company. Assigned
                students will retain their supervisor and receive the updated
                company details.
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
                  onChange={(value) =>
                    setForm((current) => ({ ...current, firstName: value }))
                  }
                  required
                  autoComplete="given-name"
                />
                <FormField
                  label="Last name"
                  name="editSupervisorLastName"
                  value={form.lastName}
                  onChange={(value) =>
                    setForm((current) => ({ ...current, lastName: value }))
                  }
                  required
                  autoComplete="family-name"
                />
              </div>
              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor="edit-supervisor-email"
              >
                Email address
                <input
                  className="mt-1.5 block box-border min-w-0 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500"
                  id="edit-supervisor-email"
                  type="email"
                  value={
                    supervisors.find((item) => item.id === modal.supervisorId)
                      ?.email || ""
                  }
                  readOnly
                />
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Sign-in email changes require updating the Firebase
                  Authentication account.
                </span>
              </label>
              <FormField
                label="Phone number"
                name="editSupervisorPhone"
                type="tel"
                value={form.phone}
                onChange={(value) =>
                  setForm((current) => ({ ...current, phone: value }))
                }
                autoComplete="tel"
              />
              <FormField
                label="Position"
                name="editSupervisorPosition"
                value={form.position}
                onChange={(value) =>
                  setForm((current) => ({ ...current, position: value }))
                }
                autoComplete="organization-title"
              />
              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor="edit-supervisor-company"
              >
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
              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor="edit-supervisor-school-year"
              >
                School Year <span className="text-rose-600">*</span>
                <select
                  className="mt-1.5 block box-border min-w-0 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  id="edit-supervisor-school-year"
                  required
                  disabled={saving}
                  value={form.schoolYear}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      schoolYear: event.target.value,
                    }))
                  }
                >
                  {[
                    ...new Set(
                      [...activeSchoolYearOptions, form.schoolYear].filter(
                        Boolean,
                      ),
                    ),
                  ]
                    .sort((a, b) => b.localeCompare(a))
                    .map((schoolYear) => (
                      <option key={schoolYear} value={schoolYear}>
                        {schoolYear}
                      </option>
                    ))}
                </select>
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
            <ModalHeader title="Supervisor Profile" onClose={closeModal} />
            <dl className="grid gap-3 p-6 sm:grid-cols-2">
              <ProfileDetail
                label="Name"
                value={displayName(modal.supervisor)}
              />
              <ProfileDetail label="Role" value="Supervisor" />
              <ProfileDetail
                label="School Year"
                value={modal.supervisor.schoolYear || "Not assigned"}
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
                value={
                  <DepartmentBadge
                    value={modal.supervisor.department || "Not provided"}
                  />
                }
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
                          {student.studentId || student.id} ·{" "}
                          {student.supervisorSchoolYear ||
                            student.schoolYear ||
                            "No School Year"}{" "}
                          ·{" "}
                          <DepartmentBadge
                            value={
                              student.course ||
                              student.department ||
                              "No course"
                            }
                          />
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
                value={
                  modal.supervisor.isArchived === true
                    ? "archived"
                    : String(modal.supervisor.status || "ACTIVE").toLowerCase()
                }
              />
              <ProfileDetail
                label="Date added"
                value={formatDate(modal.supervisor.createdAt)}
              />
            </dl>
          </section>
        </div>
      )}

      {modal?.type === "manage" &&
        (() => {
          const supervisor = supervisors.find(
            (item) => item.id === modal.supervisorId,
          );
          if (!supervisor) return null;
          const assigned = studentsOf(supervisor);
          const others = supervisors.filter(
            (item) =>
              item.id !== supervisor.id &&
              item.isArchived !== true &&
              item.status !== "ARCHIVED",
          );
          const availableForSupervisor = unassignedStudentsForYear(
            supervisor.schoolYear || currentSchoolYear,
          );
          return (
            <div
              className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4 backdrop-blur-[2px]"
              role="presentation"
            >
              <section
                aria-modal="true"
                className="max-h-[90svh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
                role="dialog"
              >
                <ModalHeader
                  title={`Students of ${displayName(supervisor)}`}
                  onClose={closeModal}
                  disabled={busy}
                />
                <div className="space-y-5 p-6 text-sm">
                  {modalError && (
                    <p className="text-rose-700" role="alert">
                      {modalError}
                    </p>
                  )}
                  <div>
                    <h3 className="mb-2 font-semibold text-slate-800">
                      Assigned students ({assigned.length})
                    </h3>
                    {assigned.length === 0 ? (
                      <p className="text-slate-500">
                        No students assigned yet.
                      </p>
                    ) : (
                      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                        {assigned.map((student) => (
                          <li
                            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                            key={student.id}
                          >
                            <span>
                              <strong className="text-slate-800">
                                {studentName(student)}
                              </strong>
                              <span className="block text-xs text-slate-500">
                                {student.studentId || student.id} ·{" "}
                                {student.supervisorSchoolYear ||
                                  student.schoolYear ||
                                  "No School Year"}{" "}
                                ·{" "}
                                <DepartmentBadge
                                  value={
                                    student.course ||
                                    student.department ||
                                    "No course"
                                  }
                                />{" "}
                                ·{" "}
                                {student.company ||
                                  supervisor.company ||
                                  "No company"}
                              </span>
                            </span>
                            <span className="flex items-center gap-2">
                              {others.some(
                                (item) =>
                                  !student.schoolYear ||
                                  item.schoolYear === student.schoolYear,
                              ) && (
                                <select
                                  aria-label={`Reassign ${studentName(student)}`}
                                  className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
                                  disabled={busy}
                                  value=""
                                  onChange={(event) =>
                                    reassignStudent(
                                      student,
                                      others.find(
                                        (item) =>
                                          item.id === event.target.value,
                                      ),
                                    )
                                  }
                                >
                                  <option value="">Reassign to…</option>
                                  {others
                                    .filter(
                                      (item) =>
                                        !student.schoolYear ||
                                        item.schoolYear === student.schoolYear,
                                    )
                                    .map((item) => (
                                      <option key={item.id} value={item.id}>
                                        {displayName(item)}
                                      </option>
                                    ))}
                                </select>
                              )}
                              <button
                                className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                                type="button"
                                disabled={busy}
                                onClick={() => removeStudent(student)}
                              >
                                Remove
                              </button>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <h3 className="mb-2 font-semibold text-slate-800">
                      Add students
                    </h3>
                    {availableForSupervisor.length === 0 ? (
                      <p className="text-slate-500">
                        All of your students for this School Year already have a
                        supervisor.
                      </p>
                    ) : (
                      <ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                        {availableForSupervisor.map((student) => (
                          <li key={student.id}>
                            <label className="flex cursor-pointer items-center gap-3 px-3 py-2">
                              <input
                                type="checkbox"
                                checked={manageSelection.includes(student.id)}
                                disabled={busy}
                                onChange={() =>
                                  setManageSelection((current) =>
                                    toggleId(current, student.id),
                                  )
                                }
                              />
                              <span>
                                {studentName(student)}{" "}
                                <span className="text-xs text-slate-500">
                                  · {student.studentId || student.id} ·{" "}
                                  <DepartmentBadge
                                    value={
                                      student.course ||
                                      student.department ||
                                      "No course"
                                    }
                                  />
                                </span>
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-3 flex justify-end">
                      <button
                        className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
                        type="button"
                        disabled={busy || manageSelection.length === 0}
                        onClick={() => addStudentsToSupervisor(supervisor)}
                      >
                        <Plus size={16} aria-hidden="true" />
                        {busy
                          ? "Saving…"
                          : `Assign ${manageSelection.length || ""} selected`}
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
      <span
        className={`grid size-11 place-items-center rounded-xl ${iconTone}`}
      >
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
    title === "Add Supervisor"
      ? "add-supervisor-title"
      : "supervisor-profile-title";
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
