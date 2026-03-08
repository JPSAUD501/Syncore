import type { ReactNode } from "react";

export function StatusCard({
  title,
  value,
  detail,
  tone = "neutral"
}: {
  title: string;
  value: string;
  detail: string;
  tone?: "neutral" | "good" | "warn";
}) {
  return (
    <div className={`status-card status-card--${tone}`}>
      <div className="status-card__title">{title}</div>
      <div className="status-card__value">{value}</div>
      <div className="status-card__detail">{detail}</div>
    </div>
  );
}

export function Panel({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <header className="panel__header">
        <h2>{title}</h2>
      </header>
      <div className="panel__body">{children}</div>
    </section>
  );
}
