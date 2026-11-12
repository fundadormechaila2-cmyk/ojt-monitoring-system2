import { Construction } from "lucide-react";

function AdminPlaceholder({ title }) {
  return (
    <section className="admin-placeholder">
      <div className="placeholder-icon">
        <Construction size={22} />
      </div>
      <p className="dashboard-eyebrow">LCCI · OJT MONITORING SYSTEM</p>
      <h1>{title}</h1>
      <p>This section is not yet available.</p>
    </section>
  );
}

export default AdminPlaceholder;
