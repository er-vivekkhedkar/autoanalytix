import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { Badge, Button, Card, CardBody, CardHeader, DataTable, EmptyState, ErrorNote } from "../ui/primitives.jsx";

export default function DataPreview({ datasetId, mutateCounter }) {
  const [data, setData] = useState(null);
  const [variant, setVariant] = useState("current");
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");
  const limit = 50;

  useEffect(() => {
    if (!datasetId) { setData(null); return; }
    api.data(datasetId, { limit, offset, variant })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [datasetId, offset, variant, mutateCounter]);

  useEffect(() => { setOffset(0); setVariant("current"); }, [datasetId]);

  function renderCell(v) {
    if (v === null || v === undefined) return <span className="text-rose-400 italic">null</span>;
    const s = typeof v === "number" ? Number.isInteger(v) ? String(v) : v.toFixed(4).replace(/0+$/, "").replace(/\.$/, "") : String(v);
    return <span title={s}>{s.length > 24 ? s.slice(0, 24) + "…" : s}</span>;
  }

  const total = data?.total ?? 0;
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));

  return (
    <Card id="preview">
      <CardHeader
        title="6 · Data preview"
        description="Inspect the working dataset. Compare against the pristine original at any time."
        icon={<span>🔍</span>}
        actions={
          <div className="flex rounded-lg border border-line bg-slate-50 p-0.5 text-xs font-medium">
            {[["current", "Cleaned"], ["original", "Original"]].map(([v, l]) => (
              <button key={v} onClick={() => { setVariant(v); setOffset(0); }}
                className={`rounded-md px-2.5 py-1 transition-colors ${variant === v ? "bg-white text-blue-700 shadow-soft" : "text-muted hover:text-ink"}`}>
                {l}
              </button>
            ))}
          </div>
        }
      />
      <CardBody>
        {!datasetId ? (
          <EmptyState title="No dataset to preview" icon="📄" />
        ) : (
          <>
            <ErrorNote className="mb-3">{error}</ErrorNote>
            {data && (
              <>
                <p className="mb-2 text-xs text-muted">
                  Showing rows <b>{offset + 1}–{Math.min(offset + limit, total)}</b> of{" "}
                  <b>{total.toLocaleString()}</b> columns={data.columns.length} ·{" "}
                  <Badge tone={variant === "original" ? "amber" : "blue"}>{variant === "original" ? "original (immutable)" : "cleaned working copy"}</Badge>
                </p>
                <DataTable
                  columns={data.columns.map((c) => ({ key: c, label: c }))}
                  rows={data.rows.map((r) => Object.fromEntries(data.columns.map((c, i) => [c, renderCell(r[i])])))}
                />
                <div className="mt-3 flex items-center justify-between">
                  <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>← Prev</Button>
                  <span className="text-xs text-muted">Page {page} / {pages}</span>
                  <Button variant="outline" size="sm" disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)}>Next →</Button>
                </div>
              </>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
