import clsx from "clsx";
import React from "react";

/* ---------------------------------------------------------------- Button */
const btnVariants = {
  primary: "bg-blue-600 text-white shadow-soft hover:bg-blue-700 active:bg-blue-800",
  outline: "border border-line bg-white text-ink hover:border-blue-300 hover:text-blue-700",
  secondary: "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-100",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-ink",
  danger: "bg-rose-600 text-white hover:bg-rose-700",
};

export function Button({ variant = "primary", size = "md", className, ...props }) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors outline-none focus:ring-2 focus:ring-blue-500/40 disabled:opacity-50 disabled:pointer-events-none select-none",
        size === "sm" ? "px-2.5 py-1.5 text-xs" : size === "lg" ? "px-5 py-2.5 text-sm" : "px-3.5 py-2 text-sm",
        btnVariants[variant],
        className
      )}
      {...props}
    />
  );
}

/* ---------------------------------------------------------------- Card */
export function Card({ className, children, ...props }) {
  return (
    <div className={clsx("bg-white rounded-2xl border border-line shadow-card", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ title, description, icon, actions, className }) {
  return (
    <div className={clsx("flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-1", className)}>
      <div className="flex items-start gap-3">
        {icon && (
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            {icon}
          </span>
        )}
        <div>
          <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-muted max-w-xl">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, children, ...props }) {
  return (
    <div className={clsx("px-5 pb-5 pt-3", className)} {...props}>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- Badge */
const badgeTones = {
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  slate: "bg-slate-100 text-slate-600 border-slate-200",
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  red: "bg-rose-50 text-rose-700 border-rose-200",
  violet: "bg-violet-50 text-violet-700 border-violet-200",
};

export function Badge({ tone = "slate", className, children }) {
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", badgeTones[tone], className)}>
      {children}
    </span>
  );
}

export const typeTone = { numeric: "blue", categorical: "violet", datetime: "amber", boolean: "green" };
export const severityTone = { info: "slate", warning: "amber", danger: "red" };

/* ---------------------------------------------------------------- Inputs */
export function Select({ className, children, ...props }) {
  return (
    <select
      className={clsx(
        "w-full rounded-lg border border-line bg-white px-2.5 py-2 text-sm text-ink outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Input({ className, ...props }) {
  return (
    <input
      className={clsx(
        "w-full rounded-lg border border-line bg-white px-2.5 py-2 text-sm text-ink outline-none transition-colors placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20",
        className
      )}
      {...props}
    />
  );
}

/* ---------------------------------------------------------------- States */
export function Spinner({ className }) {
  return (
    <svg className={clsx("h-4 w-4 animate-spin text-blue-600", className)} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export function EmptyState({ title, hint, icon }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-slate-50/60 px-6 py-10 text-center">
      {icon && <span className="text-2xl opacity-70">{icon}</span>}
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {hint && <p className="max-w-sm text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function ErrorNote({ children }) {
  if (!children) return null;
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- Section */
export function Section({ id, children, className }) {
  return (
    <section id={id} className={clsx("scroll-mt-20", className)}>
      {children}
    </section>
  );
}

/* ---------------------------------------------------------------- Tables */
export function DataTable({ columns, rows, maxHeight = "22rem", dense }) {
  return (
    <div className="scroll-thin overflow-auto rounded-xl border border-line" style={{ maxHeight }}>
      <table className="w-full min-w-max border-collapse text-sm">
        <thead>
          <tr className="sticky top-0 z-10 bg-slate-50 backdrop-blur">
            {columns.map((c, i) => (
              <th key={i} className="whitespace-nowrap border-b border-line px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line/70 last:border-0 odd:bg-white even:bg-slate-50/40 hover:bg-blue-50/40">
              {columns.map((c, j) => (
                <td key={j} className={clsx("px-3 text-slate-700", dense ? "py-1.5" : "py-2", c.align === "right" && "text-right tabular-nums")}>
                  {c.render ? c.render(r) : r[c.key] ?? "—"}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-xs text-muted">
                No rows to display.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
