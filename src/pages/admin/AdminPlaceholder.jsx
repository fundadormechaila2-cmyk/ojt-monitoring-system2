import { useAuth } from "../../context/useAuth";
import { PageHero } from "../../components/WorkspaceUI";

function AdminPlaceholder({ title }) {
  const { user } = useAuth();
  const role = String(user?.role || "admin").toUpperCase();

  return (
    <main className="admin-placeholder-page">
      <PageHero
        eyebrow={`${role} WORKSPACE · ${title}`}
        title={title}
        subtitle="This section is not yet available."
      />
    </main>
  );
}

export default AdminPlaceholder;
