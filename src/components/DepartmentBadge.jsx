import { departmentIdFor } from "../constants/departments";
import { Pill } from "./WorkspaceUI";

function DepartmentBadge({ value, className = "" }) {
  const departmentId = departmentIdFor(value);
  const label = String(value || "").trim();

  return (
    <Pill
      tone="course"
      className={`department-badge ${className}`.trim()}
      data-department={departmentId || "unknown"}
    >
      {label || "—"}
    </Pill>
  );
}

export default DepartmentBadge;
