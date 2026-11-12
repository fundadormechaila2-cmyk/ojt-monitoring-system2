import { useAuth } from "../../context/useAuth";
import { PageHeader } from "./SupervisorComponents";

function Settings() {
  const { user } = useAuth();
  const name = user?.fullName || user?.name ||
    `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || "Not provided";

  return (
    <div className="supervisor-page">
      <PageHeader title="Settings" description="View your supervisor account information." />
      <div className="supervisor-two-column">
        <section className="supervisor-panel">
          <div className="supervisor-panel-heading"><div><h2>Notifications</h2><p>Notification preferences are not yet available.</p></div></div>
        </section>
        <section className="supervisor-panel">
          <div className="supervisor-panel-heading"><div><h2>Supervisor profile</h2><p>Contact your coordinator to update your account information.</p></div></div>
          <div className="supervisor-form">
            <div className="supervisor-field"><label htmlFor="supervisor-name">Display name</label><input id="supervisor-name" className="supervisor-input" value={name} readOnly /></div>
            <div className="supervisor-field"><label htmlFor="supervisor-email">Email address</label><input id="supervisor-email" className="supervisor-input" value={user?.email || "Not provided"} readOnly /></div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default Settings;
