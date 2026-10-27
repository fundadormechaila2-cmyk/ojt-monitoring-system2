import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { BookOpen, Search, X } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { db } from "../../services/firebase";
import { withoutArchived } from "../../services/recordState";
import { PageHeader } from "../supervisor/SupervisorComponents";
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
  const [students, setStudents] = useState([]);
  const [journals, setJournals] = useState([]);
  const [studentsLoadedUid, setStudentsLoadedUid] = useState("");
  const [studentLoadError, setStudentLoadError] = useState(null);
  const [loadedJournalKey, setLoadedJournalKey] = useState("");
  const [journalLoadError, setJournalLoadError] = useState(null);
  const [search, setSearch] = useState("");
  const [selectedJournal, setSelectedJournal] = useState(null);

  useEffect(() => {
    if (user?.role !== "coordinator" || !user.uid) {
      return undefined;
    }

    return onSnapshot(
      query(
        collection(db, "students"),
        where("coordinatorUid", "==", user.uid),
      ),
      (snapshot) => {
        setStudents(
          withoutArchived(
            snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
          ),
        );
        setStudentsLoadedUid(user.uid);
        setStudentLoadError(null);
      },
      (error) => {
        console.error("Unable to load coordinator students for journals:", error);
        setStudentsLoadedUid(user.uid);
        setStudentLoadError({
          uid: user.uid,
          message:
            "Assigned students could not be loaded. Check Firestore permissions.",
        });
      },
    );
  }, [user?.role, user?.uid]);

  const studentUids = useMemo(
    () =>
      [...new Set(students.map((student) => student.studentUid).filter(Boolean))]
        .sort(),
    [students],
  );
  const studentUidKey = studentUids.join("|");
  const studentsLoading =
    Boolean(user?.uid) &&
    studentsLoadedUid !== user.uid &&
    studentLoadError?.uid !== user.uid;
  const studentsError =
    studentLoadError?.uid === user?.uid
      ? studentLoadError.message
      : user?.role !== "coordinator"
        ? "A coordinator account is required to view student journals."
        : "";

  useEffect(() => {
    if (studentsLoading) return undefined;
    if (studentsError || !studentUidKey) return undefined;

    const uids = studentUidKey.split("|");
    const uidChunks = [];
    for (let index = 0; index < uids.length; index += 30) {
      uidChunks.push(uids.slice(index, index + 30));
    }

    let active = true;
    const loadedChunks = new Set();
    const snapshotsByChunk = new Map();
    const unsubscribers = [];

    uidChunks.forEach((uids, chunkIndex) => {
      const unsubscribe = onSnapshot(
        query(
          collection(db, "journals"),
          where("studentUid", "in", uids),
        ),
        (snapshot) => {
          if (!active) return;
          snapshotsByChunk.set(
            chunkIndex,
            snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
          );
          loadedChunks.add(chunkIndex);
          setJournals(
            [...snapshotsByChunk.values()]
              .flat()
              .sort((left, right) =>
                dateValue(right.date).localeCompare(dateValue(left.date)),
              ),
          );
          if (loadedChunks.size === uidChunks.length) {
            setLoadedJournalKey(studentUidKey);
            setJournalLoadError(null);
          }
        },
        (error) => {
          if (!active) return;
          console.error("Unable to load coordinator student journals:", error);
          setJournalLoadError({
            key: studentUidKey,
            message:
              error.code === "permission-denied"
                ? "Firestore denied access to these journals. Verify the deployed coordinator journal-read rules."
                : "Student journal entries could not be loaded. Please try again.",
          });
        },
      );
      unsubscribers.push(unsubscribe);
    });

    return () => {
      active = false;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [studentUidKey, studentsError, studentsLoading]);

  const journalsError =
    journalLoadError?.key === studentUidKey
      ? journalLoadError.message
      : "";
  const journalsLoading =
    Boolean(studentUidKey) &&
    loadedJournalKey !== studentUidKey &&
    !journalsError &&
    !studentsError;
  const isLoading = studentsLoading || journalsLoading;

  const studentByUid = useMemo(
    () => new Map(students.map((student) => [student.studentUid, student])),
    [students],
  );

  const visibleJournals = useMemo(() => {
    const term = search.trim().toLowerCase();
    return journals
      .map((journal) => ({
        ...journal,
        student: studentByUid.get(journal.studentUid) || {},
      }))
      .filter((journal) => studentByUid.has(journal.studentUid))
      .filter((journal) => {
        if (!term) return true;
        const student = journal.student;
        return [
          studentName(student),
          studentId(student),
          student.course,
          student.department,
          journal.date,
          journal.taskPerformed,
          journal.skillsLearned,
          journal.problemsEncountered,
          journal.reflection,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(term);
      });
  }, [journals, search, studentByUid]);

  useEffect(() => {
    if (!selectedJournal) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setSelectedJournal(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedJournal]);

  return (
    <main className="supervisor-page space-y-6 coordinator-journals-page">
      <PageHeader
        eyebrow="Coordinator workspace · Student journals"
        title="Student Journals"
        description="Review journal entries submitted by students assigned to your department."
      />

      <section className="supervisor-panel supervisor-table-panel">
        <div className="supervisor-toolbar">
          <label className="coordinator-journals-search">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">Search student journals</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search student, ID, or journal content"
            />
          </label>
        </div>

        {isLoading ? (
          <p className="coordinator-journals-state" role="status">
            Loading student journals…
          </p>
        ) : studentsError || journalsError ? (
          <p className="coordinator-journals-error" role="alert">
            {studentsError || journalsError}
          </p>
        ) : visibleJournals.length === 0 ? (
          <div className="coordinator-journals-empty">
            <span><BookOpen size={22} aria-hidden="true" /></span>
            <h2>{search ? "No journal entries match your search" : "No journal entries yet"}</h2>
            <p>
              {search
                ? "Try another student name, ID, or keyword."
                : "Journal entries from your assigned students will appear here."}
            </p>
          </div>
        ) : (
          <div className="supervisor-table-wrap">
            <table className="supervisor-table coordinator-journals-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Student</th>
                  <th>Department / Course</th>
                  <th>Task Performed</th>
                  <th>Skills Learned</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {visibleJournals.map((journal) => (
                  <tr key={journal.id}>
                    <td>{formatDate(journal.date)}</td>
                    <td>
                      <strong>{studentName(journal.student)}</strong>
                      <small>{studentId(journal.student) || "ID not available"}</small>
                    </td>
                    <td>
                      {journal.student.department ||
                        journal.student.course ||
                        "—"}
                    </td>
                    <td className="coordinator-journals-preview">
                      {journal.taskPerformed || "—"}
                    </td>
                    <td className="coordinator-journals-preview">
                      {journal.skillsLearned || "—"}
                    </td>
                    <td>
                      <button
                        className="coordinator-journals-view"
                        type="button"
                        onClick={() => setSelectedJournal(journal)}
                        aria-label={`View journal entry by ${studentName(journal.student)} from ${formatDate(journal.date)}`}
                      >
                        View entry
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isLoading && !studentsError && !journalsError && (
          <footer className="coordinator-journals-footer">
            Showing {visibleJournals.length} of {journals.length} journal{" "}
            {journals.length === 1 ? "entry" : "entries"}
          </footer>
        )}
      </section>

      {selectedJournal && (
        <div
          className="coordinator-journal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedJournal(null);
          }}
        >
          <section
            className="coordinator-journal-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="coordinator-journal-title"
          >
            <header>
              <div>
                <p>Student journal · {formatDate(selectedJournal.date)}</p>
                <h2 id="coordinator-journal-title">
                  {studentName(selectedJournal.student)}
                </h2>
                <span>
                  {studentId(selectedJournal.student) || "ID not available"}
                  {" · "}
                  {selectedJournal.student.course ||
                    selectedJournal.student.department ||
                    "Course not available"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedJournal(null)}
                aria-label="Close journal entry"
              >
                <X size={19} />
              </button>
            </header>
            <div className="coordinator-journal-content">
              <JournalDetail label="Task Performed" value={selectedJournal.taskPerformed} />
              <JournalDetail label="Skills Learned" value={selectedJournal.skillsLearned} />
              <JournalDetail label="Problems Encountered" value={selectedJournal.problemsEncountered} />
              <JournalDetail label="Reflection" value={selectedJournal.reflection} />
            </div>
          </section>
        </div>
      )}
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
