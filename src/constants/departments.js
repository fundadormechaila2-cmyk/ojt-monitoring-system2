export const BSBA_DEPARTMENT_ID = "BSBA";

// One department per coordinator. BSBA covers both majors.
export const DEPARTMENTS = [
  { id: "BSIT", label: "Bachelor of Science in Information Technology" },
  { id: "BSHM", label: "Bachelor of Science in Hospitality Management" },
  { id: "BSBA", label: "Bachelor of Science in Business Administration (BSBA)" },
  { id: "BSED", label: "Bachelor of Science in Secondary Education" },
  { id: "BEED", label: "Bachelor of Science in Elementary Education" },
];

export const MAJORS = [
  { id: "BSBA-FM", departmentId: "BSBA", label: "Financial Management" },
  { id: "BSBA-MM", departmentId: "BSBA", label: "Marketing Management" },
];

const text = (value) => String(value || "").trim().toLowerCase();

export function departmentIdFor(value) {
  const raw = text(value);
  if (!raw) return "";
  const byId = DEPARTMENTS.find((department) => text(department.id) === raw);
  if (byId) return byId.id;
  if (raw === "bsba-fm" || raw === "bsba-mm") return BSBA_DEPARTMENT_ID;
  if (raw.includes("business administration") || /\bbsba\b/.test(raw)) {
    return BSBA_DEPARTMENT_ID;
  }
  const byLabel = DEPARTMENTS.find(
    (department) =>
      text(department.label) === raw ||
      raw.includes(text(department.label)) ||
      text(department.label).includes(raw),
  );
  return byLabel?.id || "";
}

export function departmentLabel(value) {
  const id = departmentIdFor(value);
  return DEPARTMENTS.find((department) => department.id === id)?.label || String(value || "").trim();
}

export function majorIdFor(course) {
  const raw = text(course);
  if (!raw) return "";
  if (raw === "bsba-fm" || raw.includes("financial management")) return "BSBA-FM";
  if (raw === "bsba-mm" || raw.includes("marketing management")) return "BSBA-MM";
  return "";
}

export function majorLabel(course) {
  const id = majorIdFor(course);
  return MAJORS.find((major) => major.id === id)?.label || "";
}

export function sameDepartment(a, b) {
  const left = departmentIdFor(a);
  return Boolean(left) && left === departmentIdFor(b);
}

// Department identifier of a user/student/record, derived from the stored
// departmentId, department, or (for students) their course.
export function recordDepartmentId(record) {
  return (
    departmentIdFor(record?.departmentId) ||
    departmentIdFor(record?.department) ||
    departmentIdFor(record?.course)
  );
}

// Fields to persist on a coordinator/supervisor profile.
export function departmentFields(value) {
  const id = departmentIdFor(value);
  return id ? { department: departmentLabel(id), departmentId: id } : {};
}

// Fields to persist on a student record or student profile. The course
// stays untouched; only the shared department and major are derived.
export function studentDepartmentFields(course) {
  const id = departmentIdFor(course);
  if (!id) return {};
  const major = majorIdFor(course);
  return {
    department: departmentLabel(id),
    departmentId: id,
    ...(major ? { major } : {}),
  };
}
