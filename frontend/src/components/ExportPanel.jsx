import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { chartToImage } from "./Plot.jsx";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, ErrorNote, Spinner } from "../ui/primitives.jsx";

export default function ExportPanel({ datasetId, meta, chartMetas, chartRefs }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  if (!datasetId) {
    return (
      <Card id="export">
        <CardHeader title="7 · Export results" icon={<span>📦</span>} />
        <CardBody><EmptyState title="Exports unlock after loading a dataset" hint="Download cleaned data, chart images, a PDF report or a complete ZIP package." icon="⬇️" /></CardBody>
      </Card>
    );
  }

  async function collectCharts() {
    const charts = [];
    for (const { id, title } of chartMetas) {
      const node = chartRefs?.current?.[id];
      if (!node) continue;
      const dataUrl = await chartToImage(node, { format: "png", width: 1100, height: 620 });
      if (dataUrl) charts.push({ name: sanitize(title || id), dataUrl });
    }
    return charts;
  }

  async function run(kind, label) {
    setBusy(kind); setError(""); setNote("");
    try {
      const charts = ["report", "zip"].includes(kind) ? await collectCharts() : undefined;
      if (kind === "csv") await api.exportCsv(datasetId);
      else if (kind === "json") await api.exportJson(datasetId);
      else if (kind === "report") await api.exportReport(datasetId, charts);
      else if (kind === "zip") await api.exportZip(datasetId, charts);
      setNote(`${label} downloaded ✓`);
    } catch (e) {
      setError(e.message);
    } finally { setBusy(""); }
  }

  const btn = (kind, label, desc, variant) => (
    <button onClick={() => run(kind, label)} disabled={!!busy}
      className="group flex w-full items-start gap-3 rounded-xl border border-line bg-white px-4 py-3 text-left transition-all hover:border-blue-300 hover:shadow-soft disabled:opacity-60">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-sm text-blue-600 group-hover:bg-blue-100">
        {busy === kind ? <Spinner /> : iconFor(kind)}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-800">{label}</span>
        <span className="block text-[11px] leading-snug text-muted">{desc}</span>
      </span>
    </button>
  );

  return (
    <Card id="export">
      <CardHeader
        title="7 · Export results"
        description="The cleaned working dataset is exported (your original file is never modified). Charts are captured as they are rendered."
        icon={<span>📦</span>}
        actions={meta && <Badge tone="blue">{meta.name} · {meta.rows.toLocaleString()}×{meta.cols}</Badge>}
      />
      <CardBody>
        <ErrorNote className="mb-3">{error}</ErrorNote>
        {note && !error && <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{note}</div>}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {btn("csv", "Cleaned CSV", "Current working dataset as .csv")}
          {btn("json", "Cleaned JSON", "Current working dataset as .json")}
          {btn("report", "PDF report", `Profile, statistics, cleaning log${chartMetas.length ? " + figure list" : ""}`)}
          {btn("zip", "Complete ZIP", "Data + statistics + PDF report + chart PNGs")}
        </div>
        {chartMetas.length === 0 && (
          <p className="mt-2 text-[11px] text-muted">Tip: generate charts in the builder above — they are bundled into the PDF report and ZIP package.</p>
        )}
      </CardBody>
    </Card>
  );
}

function iconFor(kind) {
  return kind === "csv" ? "📄" : kind === "json" ? "🧾" : kind === "report" ? "📕" : "🗜️";
}

function sanitize(name) {
  return (name || "chart").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_").slice(0, 60) || "chart";
}
