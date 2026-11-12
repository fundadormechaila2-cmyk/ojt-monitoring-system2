import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Search,
} from "lucide-react";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { useAuth } from "../../context/useAuth";
import { db } from "../../services/firebase";
import { withoutArchived } from "../../services/recordState";
import { PageHeader } from "../supervisor/SupervisorComponents";
import DepartmentBadge from "../../components/DepartmentBadge";
import { recordDepartmentId } from "../../constants/departments";
import "../../styles/coordinator-journals.css";

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

function studentId(student) {
  return String(
    student.studentId ||
      student.studentID ||
      student.idNumber ||
      student.id ||
      "",
  );
}

function dateValue(value) {
  if (typeof value === "string") return value.slice(0, 10);
  const date = value?.toDate?.() || value;
  return date instanceof Date && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date)
    : "";
}

function formatDate(value) {
  const date = dateValue(value);
  if (!date) return "—";
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

function StudentJournals() {
  const { user } = useAuth();
  const departmentId = recordDepartmentId(user);
  const [students, setStudents] = useState([]);
  const [studentsLoadedUid, setStudentsLoadedUid] = useState("");
  const [studentLoadError, setStudentLoadError] = useState(null);
  const [journalCountData, setJournalCountData] = useState(null);
  const [loadedCountKey, setLoadedCountKey] = useState("");
  const [countLoadError, setCountLoadError] = useState(null);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [journalData, setJournalData] = useState(null);
  const [journalLoadError, setJournalLoadError] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (user?.role !== "coordinator" || !user.uid || !departmentId) return undefined;

    return onSnapshot(
      query(
        collection(db, "students"),
        where("coordinatorUid", "==", user.uid),
        where("departmentId", "==", departmentId),
      ),
      (snapshot) => {
        const assignedStudents = withoutArchived(
          snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
        );
        setStudents(assignedStudents);
        setStudentsLoadedUid(user.uid);
        setStudentLoadError(null);
      },
      (error) => {
        console.error("Unable to load coordinator students for journals:", error);
        setStudentsLoadedUid(user.uid);
        setStudentLoadError({
          uid: user.uid,
          message: "Assigned students could not be loaded. Check Firestore permissions.",
        });
      },
    );
  }, [user?.role, user?.uid, departmentId]);

  const studentsLoading =
    Boolean(user?.uid && departmentId) &&
    studentsLoadedUid !== user.uid &&
    studentLoadError?.uid !== user.uid;
  const studentsError =
    studentLoadError && studentLoadError.uid === user?.uid
      ? studentLoadError.message
      : user?.role !== "coordinator"
        ? "A coordinator account is required to view student journals."
        : !departmentId
          ? "Your coordinator account has no recognized department. Ask an administrator to assign one in OJT Coordinators."
        : "";

  const studentUids = useMemo(
    () => [...new Set(students.map((student) => student.studentUid).filter(Boolean))].sort(),
    [students],
  );
  const studentUidKey = studentUids.join("|");
  const studentQueryKey = `${user?.uid || ""}:${studentUidKey}`;

  useEffect(() => {
    if (studentsLoading || studentsError || !studentUidKey) return undefined;

    const uids = studentUidKey.split("|");
    const uidChunks = [];
    for (let index = 0; index < uids.length; index += 30) {
      uidChunks.push(uids.slice(index, index + 30));
    }

    let active = true;
    const loadedChunks = new Set();
    const countsByChunk = new Map();
    const unsubscribers = uidChunks.map((uids, chunkIndex) =>
      onSnapshot(
        query(collection(db, "journals"), where("studentUid", "in", uids)),
        (snapshot) => {
          if (!active) return;
          const counts = {};
          snapshot.docs.forEach((entry) => {
            const journal = entry.data();
            if (uids.includes(journal.studentUid)) {
              counts[journal.studentUid] = (counts[journal.studentUid] || 0) + 1;
            }
          });
          countsByChunk.set(chunkIndex, counts);
          loadedChunks.add(chunkIndex);
          setJournalCountData((previous) => ({
            key: studentQueryKey,
            counts: Object.assign(
              {},
              previous?.key === studentQueryKey ? previous.counts : {},
              ...countsByChunk.values(),
            ),
          }));
          if (loadedChunks.size === uidChunks.length) {
            setLoadedCountKey(studentQueryKey);
            setCountLoadError(null);
          }
        },
        (error) => {
          if (!active) return;
          console.error("Unable to load assigned student journal counts:", error);
          setCountLoadError({
            key: studentQueryKey,
            message:
              error.code === "permission-denied"
                ? "Firestore denied access to assigned student journals. Check the coordinator journal-read rules."
                : "Journal counts could not be loaded. Please try again.",
          });
        },
      ),
    );

    return () => {
      active = false;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [studentQueryKey, studentUidKey, studentsError, studentsLoading]);

  const selectedStudent = students.find(
    (student) => student.id === selectedStudentId,
  );

  useEffect(() => {
    const studentUid = selectedStudent?.studentUid;
    if (!studentUid || !studentUids.includes(studentUid)) return undefined;

    return onSnapshot(
      query(
        collection(db, "journals"),
        where("studentUid", "==", studentUid),
      ),
      (snapshot) => {
        setJournalData({
          uid: studentUid,
          entries: snapshot.docs
            .map((item) => ({ id: item.id, ...item.data() }))
            .filter((journal) => journal.studentUid === studentUid)
            .sort((left, right) =>
              dateValue(right.date).localeCompare(dateValue(left.date)),
            ),
        });
        setJournalLoadError(null);
      },
      (error) => {
        console.error("Unable to load selected student journals:", error);
        setJournalLoadError({
          uid: studentUid,
          message:
            error.code === "permission-denied"
              ? "Firestore denied access to this student's journals. Check the coordinator journal-read rules."
              : "This student's journal entries could not be loaded. Please try again.",
        });
      },
    );
  }, [selectedStudent?.studentUid, studentUids]);

  const visibleStudents = useMemo(() => {
    const term = search.trim().toLowerCase();
    return students
      .filter((student) =>
        !term ||
        `${studentName(student)} ${studentId(student)}`
          .toLowerCase()
          .includes(term),
      )
      .sort((left, right) => studentName(left).localeCompare(studentName(right)));
  }, [search, students]);

  const isLoadingStudents = studentsLoading || (
    Boolean(studentUidKey) && loadedCountKey !== studentQueryKey &&
    countLoadError?.key !== studentQueryKey
  );
  const selectedJournals =
    journalData && journalData.uid === selectedStudent?.studentUid
      ? journalData.entries
      : [];
  const journalsLoading =
    Boolean(selectedStudent?.studentUid) &&
    journalData?.uid !== selectedStudent.studentUid &&
    journalLoadError?.uid !== selectedStudent.studentUid;
  const selectedJournalError =
    journalLoadError && journalLoadError.uid === selectedStudent?.studentUid
      ? journalLoadError.message
      : "";
  const countError =
    countLoadError?.key === studentQueryKey ? countLoadError.message : "";
  const journalCounts =
    journalCountData?.key === studentQueryKey ? journalCountData.counts : {};

  return (
    <main className="supervisor-page space-y-6 coordinator-journals-page">
      <PageHeader
        eyebrow="Coordinator workspace · Student journals"
        title={selectedStudent ? `${studentName(selectedStudent)} · Journals` : "Student Journals"}
        description={
          selectedStudent
            ? "Review this student's submitted journal entries."
            : "Find a student assigned to you and review their submitted journals."
        }
      />

      <section className="supervisor-panel supervisor-table-panel">
        {selectedStudent ? (
          <>
            <div className="coordinator-journals-detail-toolbar">
              <button
                type="button"
                className="coordinator-journals-back"
                onClick={() => setSelectedStudentId("")}
              >
                <ArrowLeft size={16} aria-hidden="true" />
                Back to Student List
              </button>
              <div className="coordinator-journals-student-meta">
                <span className="coordinator-journals-meta-item">
                  <small>Student ID</small>
                  <strong>{studentId(selectedStudent) || "Not available"}</strong>
                </span>
                <span className="coordinator-journals-meta-item coordinator-journals-department">
                  <small>Department / Course</small>
                  <DepartmentBadge
                    value={selectedStudent.department || selectedStudent.course || "Course not available"}
                  />
                </span>
                <span className="coordinator-journals-meta-item">
                  <small>Company</small>
                  <strong>{selectedStudent.company || selectedStudent.companyName || "Not assigned"}</strong>
                </span>
                <span className="coordinator-journals-entry-count">
                  <BookOpen size={15} aria-hidden="true" />
                  {selectedJournals.length} {selectedJournals.length === 1 ? "entry" : "entries"}
                </span>
              </div>
            </div>

            {studentsError || selectedJournalError ? (
              <p className="coordinator-journals-error" role="alert">
                {studentsError || selectedJournalError}
              </p>
            ) : journalsLoading ? (
              <p className="coordinator-journals-state" role="status">
                Loading journal entries…
              </p>
            ) : selectedJournals.length === 0 ? (
              <div className="coordinator-journals-empty">
                <span><BookOpen size={22} aria-hidden="true" /></span>
                <h2>No journal entries yet</h2>
                <p>Submitted journals for this student will appear here.</p>
              </div>
            ) : (
              <div className="coordinator-journal-list">
                {selectedJournals.map((journal, index) => (
                  <article className="coordinator-journal-entry" key={journal.id}>
                    <header>
                      <p>Journal entry <span>{String(index + 1).padStart(2, "0")}</span></p>
                      <time>{formatDate(journal.date)}</time>
                    </header>
                    <div className="coordinator-journal-details">
                      <JournalDetail label="Task Performed" value={journal.taskPerformed} />
                      <JournalDetail label="Skills Learned" value={journal.skillsLearned} />
                      <JournalDetail label="Problems Encountered" value={journal.problemsEncountered} />
                      <JournalDetail label="Reflection" value={journal.reflection} />
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="supervisor-toolbar">
              <label className="coordinator-journals-search">
                <Search size={16} aria-hidden="true" />
                <span className="sr-only">Search students by name or student ID</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by student name or ID"
                />
              </label>
            </div>

            {studentsLoading || isLoadingStudents ? (
              <p className="coordinator-journals-state" role="status">
                Loading assigned students…
              </p>
            ) : studentsError || countError ? (
              <p className="coordinator-journals-error" role="alert">
                {studentsError || countError}
              </p>
            ) : visibleStudents.length === 0 ? (
              <div className="coordinator-journals-empty">
                <span><BookOpen size={22} aria-hidden="true" /></span>
                <h2>{search ? "No students match your search" : "No assigned students found"}</h2>
                <p>
                  {search
                    ? "Try another student name or ID."
                    : "Students assigned to you will appear here."}
                </p>
              </div>
            ) : (
              <div className="supervisor-table-wrap">
                <table className="supervisor-table coordinator-journals-students-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Student ID</th>
                      <th>Department / Course</th>
                      <th>Company Assigned</th>
                      <th>Journal Entries</th>
                      <th><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleStudents.map((student) => (
                      <tr key={student.id}>
                        <td><strong>{studentName(student)}</strong></td>
                        <td>{studentId(student) || "—"}</td>
                        <td>
                          <DepartmentBadge
                            value={student.department || student.course || "Not specified"}
                          />
                        </td>
                        <td>{student.company || student.companyName || "Not assigned"}</td>
                        <td>{journalCounts[student.studentUid] || 0}</td>
                        <td>
                          <button
                            type="button"
                            className="coordinator-journals-view"
                            onClick={() => setSelectedStudentId(student.id)}
                            aria-label={`View journals for ${studentName(student)}`}
                          >
                            View Journals
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!studentsLoading && !isLoadingStudents && !studentsError && !countError && (
              <footer className="coordinator-journals-footer">
                Showing {visibleStudents.length} of {students.length} assigned students
              </footer>
            )}
          </>
        )}
      </section>
    </main>
  );
}

function JournalDetail({ label, value }) {
  return (
    <section>
      <h3>{label}</h3>
      <p>{value?.trim() || "No response provided."}</p>
    </section>
  );
}

export default StudentJournals;
