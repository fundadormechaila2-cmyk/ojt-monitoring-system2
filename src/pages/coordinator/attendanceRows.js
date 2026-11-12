export function buildAttendanceRows(students, records, filters) {
  const search = filters.search.trim().toLowerCase();
  const studentsByUid = new Map();
  students.forEach((student) => {
    if (student.uid) {
      studentsByUid.set(student.uid, studentsByUid.has(student.uid) ? null : student);
    }
  });

  const datedRecords = records.filter((record) => !filters.date || record.date === filters.date);
  const representedUids = new Set(datedRecords.map((record) => record.studentUid).filter(Boolean));
  const rows = datedRecords.map((record) => {
    const student = studentsByUid.get(record.studentUid);
    return {
      key: `record:${record.id}`,
      student,
      record,
      name: student?.name || record.studentName,
      studentId: student?.studentId || record.studentId,
      company: student?.company || record.company,
    };
  });

  students.forEach((student) => {
    if (!student.uid || !representedUids.has(student.uid)) {
      rows.push({
        key: `student:${student.id}`,
        student,
        record: null,
        name: student.name,
        studentId: student.studentId,
        company: student.company,
      });
    }
  });

  return rows.filter((row) =>
    (!search || `${row.name} ${row.studentId} ${row.company}`.toLowerCase().includes(search)) &&
    (filters.status === "All" || row.record?.status === filters.status) &&
    (filters.company === "All companies" || row.company === filters.company),
  );
}
