import React from "react";
import { Badge, Button } from "../ui/primitives.jsx";

const links = [
  ["upload", "Upload"],
  ["overview", "Overview"],
  ["cleaning", "Cleaning"],
  ["charts", "Charts"],
  ["stats", "Statistics"],
  ["preview", "Data"],
  ["export", "Export"],
];

export default function Header({ meta, onReset }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white shadow-soft">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M5 19V11M10.5 19V5M16 19v-6M21 19V9" />
            </svg>
          </span>
          <div className="leading-tight">
            <p className="text-[15px] font-bold tracking-tight">AutoAnalytix</p>
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted">No-code data analytics</p>
          </div>
        </div>

        <nav className="flex flex-wrap items-center gap-0.5 text-xs font-medium text-slate-600 lg:ml-4">
          {links.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="rounded-lg px-2.5 py-1.5 transition-colors hover:bg-slate-100 hover:text-blue-700">
              {label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {meta && (
            <>
              <Badge tone="blue" className="max-w-[180px] truncate">
                ● {meta.name} · {meta.rows.toLocaleString()}×{meta.cols}
              </Badge>
              {meta.changes > 0 && <Badge tone="green">{meta.changes} cleaning step{meta.changes > 1 ? "s" : ""}</Badge>}
              <Button variant="ghost" size="sm" onClick={onReset} title="Clear the current dataset">
                Reset
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
