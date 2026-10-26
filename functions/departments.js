// Mirrors src/constants/departments.js. BSBA-FM and BSBA-MM share "BSBA".
const DEPARTMENT_IDS = ["BSIT", "BSHM", "BSBA", "BSED", "BEED"];
const DEPARTMENT_NAMES = {
  BSIT: "bachelor of science in information technology",
  BSHM: "bachelor of science in hospitality management",
  BSED: "bachelor of science in secondary education",
  BEED: "bachelor of science in elementary education",
};

function departmentIdFor(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  const byId = DEPARTMENT_IDS.find((id) => id.toLowerCase() === raw);
  if (byId) return byId;
  if (raw === "bsba-fm" || raw === "bsba-mm") return "BSBA";
  if (raw.includes("business administration") || /\bbsba\b/.test(raw)) return "BSBA";
  const match = Object.entries(DEPARTMENT_NAMES).find(([, name]) => raw.includes(name));
  return match ? match[0] : "";
}

function recordDepartmentId(record) {
  return (
    departmentIdFor(record?.departmentId) ||
    departmentIdFor(record?.department) ||
    departmentIdFor(record?.course)
  );
}

function sameDepartment(a, b) {
  const left = recordDepartmentId(a);
  return Boolean(left) && left === recordDepartmentId(b);
}

module.exports = { departmentIdFor, recordDepartmentId, sameDepartment };
