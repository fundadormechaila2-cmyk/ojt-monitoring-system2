import { CalendarDays } from "lucide-react";

export function PageHero({ eyebrow, title, subtitle, action, className = "" }) {
  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <header className={`workspace-page-hero ${className}`.trim()}>
      <div className="workspace-page-hero-copy">
        <p className="workspace-page-hero-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {subtitle && <p className="workspace-page-hero-subtitle">{subtitle}</p>}
      </div>
      <div className="workspace-page-hero-actions">
        {action}
        <span className="workspace-date-chip">
          <CalendarDays size={16} aria-hidden="true" />
          {today}
        </span>
      </div>
    </header>
  );
}

export function DataCard({ as: Element = "section", className = "", children, ...props }) {
  return (
    <Element className={`workspace-data-card ${className}`.trim()} {...props}>
      {children}
    </Element>
  );
}

export function Pill({ tone = "neutral", className = "", children, ...props }) {
  return (
    <span
      className={`workspace-pill workspace-pill-${tone} ${className}`.trim()}
      data-tone={tone}
      {...props}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ value, tone, className = "", ...props }) {
  const normalized = String(value || "").trim().toLowerCase();
  const resolvedTone = tone || (
    /pending|late|incomplete|review|time-in|ongoing|not deployed|not submitted|in progress/.test(normalized)
      ? "warning"
      : /rejected|absent|inactive|attention|overdue/.test(normalized)
        ? "danger"
        : /approved|present|complete|active|ready|submitted|logged/.test(normalized)
          ? "success"
          : "neutral"
  );

  return (
    <Pill tone={resolvedTone} className={className} {...props}>
      {value}
    </Pill>
  );
}
