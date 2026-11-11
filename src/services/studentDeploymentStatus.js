const UNASSIGNED_VALUES = new Set([
  "-",
  "n/a",
  "na",
  "none",
  "not assigned",
  "not deployed",
  "not specified",
  "unassigned",
  "undefined",
]);

function hasAssignedValue(record, fields) {
  return fields.some((field) => {
    const value = record?.[field];
    if (value === undefined || value === null || value === false) return false;
    if (typeof value === "object") {
      return hasAssignedValue(value, ["id", "uid", "name", "companyName", "displayName"]);
    }
    const normalized = String(value).trim().toLowerCase();
    return normalized !== "" && !UNASSIGNED_VALUES.has(normalized);
  });
}

export function hasCompanyAssignment(student) {
  return hasAssignedValue(student, [
    "partnerCompanyId",
    "companyId",
    "company",
    "partnerCompany",
    "companyName",
    "partnerCompanyName",
  ]);
}

export function hasSupervisorAssignment(student) {
  return hasAssignedValue(student, [
    "supervisorUid",
    "supervisorId",
    "assignedSupervisorUid",
    "assignedSupervisorId",
  ]);
}

export function getStudentDeploymentStatus(student, completedHours, requiredHours) {
  const completed = Number(completedHours);
  const required = Number(requiredHours);
  if (
    Number.isFinite(completed) &&
    Number.isFinite(required) &&
    required > 0 &&
    completed >= required
  ) {
    return "COMPLETED";
  }

  const hasCompany = hasCompanyAssignment(student);
  const hasSupervisor = hasSupervisorAssignment(student);
  if (hasCompany && hasSupervisor) return "DEPLOYED";
  if (hasCompany || hasSupervisor) return "PENDING";
  return "NOT DEPLOYED";
}
