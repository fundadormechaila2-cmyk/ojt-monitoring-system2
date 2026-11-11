import { CalendarDays, Search } from "lucide-react";
import "../../styles/supervisor.css";

export function PageHeader({ eyebrow = "Supervisor workspace", title, description, action, className = "" }) {
  return (
    <header className={`supervisor-header ${className}`.trim()}>
      <div>
        <p className="supervisor-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action || <span className="supervisor-date"><CalendarDays size={16} />{new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>}
    </header>
  );
}

export function StatCard({ icon: Icon, label, value, detail, tone = "" }) {
  return <article className="supervisor-card"><div className={`supervisor-card-icon ${tone}`}><Icon size={19} /></div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>;
}

export function SearchBox({ value, onChange, placeholder = "Search records..." }) {
  return <label className="supervisor-search"><Search size={16} /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>;
}

export function Status({ value }) {
  const normalized = value.toLowerCase();
  const tone = normalized.includes("pending") || normalized.includes("late")
    ? "pending"
    : normalized.includes("not deployed") || normalized.includes("absent") || normalized.includes("attention")
      ? "warning"
      : "";
  return <span className={`supervisor-status ${tone}`}>{value}</span>;
}
