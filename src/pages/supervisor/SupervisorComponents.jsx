import { Search } from "lucide-react";
import { DataCard, PageHero, StatusBadge } from "../../components/WorkspaceUI";
import "../../styles/supervisor.css";

export function PageHeader({ eyebrow, title, description, action, className = "" }) {
  return (
    <PageHero
      eyebrow={eyebrow || `SUPERVISOR WORKSPACE · ${title}`}
      title={title}
      subtitle={description}
      action={action}
      className={className}
    />
  );
}

export function StatCard({ icon: Icon, label, value, detail, tone = "" }) {
  return <DataCard as="article" className="supervisor-card"><div className={`supervisor-card-icon ${tone}`}><Icon size={19} /></div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></DataCard>;
}

export function SearchBox({ value, onChange, placeholder = "Search records..." }) {
  return <label className="supervisor-search"><Search size={16} /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>;
}

export function Status({ value }) {
  return <StatusBadge value={value} className="supervisor-status" />;
}
