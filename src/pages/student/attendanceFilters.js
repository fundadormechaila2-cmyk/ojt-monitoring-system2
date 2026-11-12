function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function matchesAttendanceFilters(record, filters = {}) {
  const studentName = normalize(filters.studentName);
  const studentId = normalize(filters.studentId);
  const schoolYear = normalize(filters.schoolYear);

  if (studentName && !normalize(record?.studentName).includes(studentName)) {
    return false;
  }

  if (studentId && !normalize(record?.studentId).includes(studentId)) {
    return false;
  }

  if (schoolYear && !normalize(record?.schoolYear).includes(schoolYear)) {
    return false;
  }

  return true;
}
