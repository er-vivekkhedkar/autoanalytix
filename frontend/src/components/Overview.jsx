import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { Badge, Card, CardBody, CardHeader, DataTable, EmptyState, typeTone } from "../ui/primitives.jsx";

function Kpi({ label, value, sub, tone = "slate" }) {
  const tones = { slate: "text-slate-700", blue: "text-blue-700", red: "text-rose-600", green: "text-emerald-600" };
  return (
    <div className="rounded-xl border border-line bg-slate-50/60 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${tones[tone]} leading-tight`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

export default function Overview({ datasetId, profile, meta }) {
  const [variant, setVariant] = useState("current");

  if (!profile) {
    return (
      <Card id="overview">
        <CardHeader title="2 · Dataset overview" icon={<span>📊</span>} />
        <CardBody><EmptyState title="No dataset loaded yet" hint="Upload a file or click a sample dataset above — profiling happens automatically." icon="🗂️" /></CardBody>
      </Card>
    );
  }

  const p = profile.profile;
  const orig = profile.original;
  const cols = p.columns.map((c) => ({
    name: c.name,
    label: (
      <span className="flex items-center gap-2">
        <span className="font-medium text-slate-800">{c.name}</span>
      </span>
    ),
    type: <Badge tone={typeTone[c.type] || "slate"}>{c.type}</Badge>,
    missing: c.missing > 0 ? <span className="font-medium text-rose-600">{c.missing} ({c.missingPct}%)</span> : "0",
    unique: c.unique,
    range: c.type === "numeric" ? `${fmt(c.min)} – ${fmt(c.max)}` : (c.sample || []).map(String).join(", ").slice(0, 40),
    dtype: c.dtype,
  }));

  const extra = variant === "original"
    ? { rows: orig.rows, cols: orig.cols, missing: orig.missingCells, dups: orig.duplicates }
    : null;

  return (
    <Card id="overview">
      <CardHeader
        title="2 · Dataset overview"
        description={`Automated profile of “${profile.name}”.`}
        icon={<span>📊</span>}
        actions={
          <div className="flex rounded-lg border border-line bg-slate-50 p-0.5 text-xs font-medium">
            {[["current", "Cleaned"], ["original", "Original"]].map(([v, l]) => (
              <button key={v} onClick={() => setVariant(v)}
                className={`rounded-md px-2.5 py-1 transition-colors ${variant === v ? "bg-white text-blue-700 shadow-soft" : "text-muted hover:text-ink"}`}>
                {l}
              </button>
            ))}
          </div>
        }
      />
      <CardBody>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi label="Rows" value={extra ? extra.rows.toLocaleString() : p.rows.toLocaleString()} sub={extra ? "original" : undefined} />
          <Kpi label="Columns" value={extra ? extra.cols : p.cols} sub={p.numericCols ? `${p.numericCols} numeric` : undefined} />
          <Kpi label="Missing cells" value={(extra ? extra.missing : p.missingCells).toLocaleString()} sub={`${p.missingPct}% of all cells`} tone={p.missingCells > 0 ? "red" : "green"} />
          <Kpi label="Duplicate rows" value={(extra ? extra.dups : p.duplicates).toLocaleString()} tone={p.duplicates > 0 ? "red" : "green"} />
          <Kpi label="Complete rows" value={p.completeRows.toLocaleString()} sub="no missing values" />
          <Kpi label="Cleaning steps" value={profile.changes ?? 0} sub="applied" tone={profile.changes > 0 ? "blue" : "slate"} />
        </div>

        <div className="mt-4">
          <DataTable
            columns={[
              { key: "label", label: "Column" },
              { key: "type", label: "Inferred type" },
              { key: "dtype", label: "Pandas dtype" },
              { key: "missing", label: "Missing", align: "right" },
              { key: "unique", label: "Unique", align: "right" },
              { key: "range", label: "Min – Max / sample" },
            ]}
            rows={cols}
          />
        </div>
      </CardBody>
    </Card>
  );
}

function fmt(v) {
  if (v == null) return "—";
  const f = Number(v);
  if (!isFinite(f)) return String(v);
  return Math.abs(f) >= 1000 ? f.toLocaleString(undefined, { maximumFractionDigits: 1 }) : +f.toFixed(3) + "";
}
