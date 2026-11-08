import { departmentIdFor } from "../constants/departments";

function DepartmentBadge({ value, className = "" }) {
  const departmentId = departmentIdFor(value);
  const label = String(value || "").trim();

  if (!label) return <span className={`department-badge ${className}`.trim()}>—</span>;

  return (
    <span
      className={`department-badge ${className}`.trim()}
      data-department={departmentId || "unknown"}
    >
      {label}
    </span>
  );
}

export default DepartmentBadge;
