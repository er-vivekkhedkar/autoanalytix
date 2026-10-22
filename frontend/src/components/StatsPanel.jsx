import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { Badge, Button, Card, CardBody, CardHeader, DataTable, EmptyState, ErrorNote, Select, Spinner } from "../ui/primitives.jsx";

function fmt(v, nd = 3) {
  if (v == null || v === "") return "—";
  const f = Number(v);
  if (!isFinite(f)) return String(v);
  return Math.abs(f) >= 10000 ? f.toLocaleString(undefined, { maximumFractionDigits: 1 }) : +f.toFixed(nd) + "";
}

export default function StatsPanel({ datasetId, columns, mutateCounter }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reg, setReg] = useState(null);
  const [regErr, setRegErr] = useState("");
  const [regBusy, setRegBusy] = useState(false);
  const [regCfg, setRegCfg] = useState({ x: "", y: "" });

  useEffect(() => {
    if (!datasetId) { setStats(null); return; }
    setLoading(true); setError("");
    api.stats(datasetId)
      .then(setStats)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [datasetId, mutateCounter]);

  useEffect(() => { setReg(null); setRegCfg({ x: "", y: "" }); }, [datasetId]);

  if (!datasetId) {
    return (
      <Card id="stats">
        <CardHeader title="5 · Statistical analysis" icon={<span>🧮</span>} />
        <CardBody><EmptyState title="Statistics appear after loading a dataset" icon="📐" /></CardBody>
      </Card>
    );
  }

  const numeric = Object.keys(stats?.numeric || {});

  async function runRegression() {
    setRegBusy(true); setRegErr("");
    try {
      setReg(await api.regression(datasetId, regCfg.x, regCfg.y));
    } catch (e) { setRegErr(e.message); } finally { setRegBusy(false); }
  }

  const corr = stats?.correlations;
  const corrCols = corr?.columns || [];

  return (
    <Card id="stats">
      <CardHeader title="5 · Statistical analysis" description="Descriptive statistics, frequency distributions and Pearson correlations — computed live on the current (cleaned) data." icon={<span>🧮</span>} />
      <CardBody>
        <ErrorNote className="mb-3">{error || null}</ErrorNote>
        {loading && <EmptyState icon={<Spinner className="h-5 w-5" />} title="Computing statistics…" />}

        {!loading && numeric.length === 0 && (
          <EmptyState title="No numeric columns found" hint="Descriptive statistics need at least one numeric column. Correlations and regression also need two." />
        )}

        {!loading && numeric.length > 0 && (
          <>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Descriptive statistics</p>
            <DataTable
              columns={[
                { key: "col", label: "Column" },
                { key: "mean", label: "Mean", align: "right" }, { key: "median", label: "Median", align: "right" },
                { key: "mode", label: "Mode" }, { key: "std", label: "Std dev", align: "right" },
                { key: "var", label: "Variance", align: "right" }, { key: "min", label: "Min", align: "right" },
                { key: "q1", label: "Q1", align: "right" }, { key: "q3", label: "Q3", align: "right" },
                { key: "max", label: "Max", align: "right" }, { key: "skew", label: "Skew", align: "right" },
              ]}
              rows={numeric.map((c) => {
                const s = stats.numeric[c];
                return { col: c, mean: fmt(s.mean), median: fmt(s.median), mode: s.mode.map(fmt).join(", "), std: fmt(s.std), var: fmt(s.variance), min: fmt(s.min), q1: fmt(s.q1), q3: fmt(s.q3), max: fmt(s.max), skew: fmt(s.skew, 2) };
              })}
            />
          </>
        )}

        {!loading && corrCols.length > 1 && (
          <div className="mt-4">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Correlation matrix (Pearson)</p>
            <DataTable
              columns={[
                { key: "pair", label: "" },
                ...corrCols.map((c) => ({ key: c, label: c, align: "right" })),
              ]}
              rows={corrCols.map((c, i) => {
                const row = { pair: c };
                corrCols.forEach((c2, j) => {
                  const r = corr.matrix[i][j];
                  row[c2] = <span className={`tabular-nums ${i !== j && Math.abs(r) >= 0.4 ? "font-semibold text-blue-700" : "text-slate-500"}`}>{r == null ? "—" : r.toFixed(2)}</span>;
                });
                return row;
              })}
            />
          </div>
        )}

        {!loading && stats?.frequencies && Object.keys(stats.frequencies).length > 0 && (
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {Object.entries(stats.frequencies).slice(0, 6).map(([col, rows]) => (
              <div key={col}>
                <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Frequencies · {col} <Badge tone="blue">{rows.length} top values</Badge>
                </p>
                <DataTable
                  dense maxHeight="14rem"
                  columns={[{ key: "value", label: "Value" }, { key: "count", label: "Count", align: "right" }, { key: "pct", label: "Share", align: "right" }]}
                  rows={rows.map((r) => ({ value: String(r.value), count: r.count, pct: `${r.pct}%` }))}
                />
              </div>
            ))}
          </div>
        )}

        {!loading && numeric.length >= 2 && (
          <div className="mt-4 rounded-xl border border-line bg-slate-50/60 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Optional · Linear regression</p>
            <div className="flex flex-wrap items-end gap-2">
              <Select className="w-44" value={regCfg.x} onChange={(e) => setRegCfg((r) => ({ ...r, x: e.target.value }))}>
                <option value="">— X column —</option>{numeric.map((c) => <option key={c}>{c}</option>)}
              </Select>
              <Select className="w-44" value={regCfg.y} onChange={(e) => setRegCfg((r) => ({ ...r, y: e.target.value }))}>
                <option value="">— Y column —</option>{numeric.map((c) => <option key={c}>{c}</option>)}
              </Select>
              <Button size="sm" onClick={runRegression} disabled={regBusy || !regCfg.x || !regCfg.y}>
                {regBusy ? <Spinner className="text-white" /> : null} Fit regression
              </Button>
            </div>
            <ErrorNote className="mt-2">{regErr}</ErrorNote>
            {reg && (
              <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <Info label="Equation" value={<code>{reg.equation}</code>} />
                <Info label="R²" value={reg.r2.toFixed(4)} />
                <Info label="p-value" value={reg.pValue < 1e-4 ? "< 0.0001" : reg.pValue.toFixed(4)} />
                <Info label="n" value={reg.n.toLocaleString()} />
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 font-medium text-slate-700">{value}</p>
    </div>
  );
}
