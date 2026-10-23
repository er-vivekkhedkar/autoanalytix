import React, { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import Plot, { chartToImage } from "./Plot.jsx";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, ErrorNote, Input, Select, Spinner } from "../ui/primitives.jsx";

const chartOptions = [
  ["bar", "Bar"], ["line", "Line"], ["pie", "Pie"], ["donut", "Donut"], ["area", "Area"],
  ["histogram", "Histogram"], ["scatter", "Scatter"], ["bubble", "Bubble"], ["box", "Box"],
  ["violin", "Violin"], ["strip", "Strip"], ["ecdf", "ECDF"], ["heatmap", "Heatmap"],
  ["density_heatmap", "Density heatmap"], ["contour", "Contour"],
];
const aggOptions = [
  ["", "— aggregation —"], ["count", "Count"], ["mean", "Mean"], ["median", "Median"],
  ["sum", "Sum"], ["min", "Min"], ["max", "Max"], ["nunique", "Distinct"],
];
const filterOps = [["eq", "= equals"], ["ne", "≠ not"], ["gt", "> greater"], ["gte", "≥ ≥equal"], ["lt", "< less"], ["lte", "≤ ≤equal"], ["contains", "contains"]];

function suggestedTitle(cfg) {
  const bits = [];
  if (cfg.agg && cfg.agg !== "none" && cfg.y) bits.push(`${cfg.agg} of ${cfg.y}`);
  if (cfg.x) bits.push(`by ${cfg.x}`);
  return bits.join(" ") || cfg.type;
}

export default function ChartBuilder({ datasetId, columns, mutateCounter, onChartsChange, chartRefs }) {
  const [suggestions, setSuggestions] = useState([]);
  const [chartTypes, setChartTypes] = useState(chartOptions);
  const [cfg, setCfg] = useState({ type: "bar", x: "", y: "", group: "", size: "", agg: "", title: "", filters: [] });
  const [figures, setFigures] = useState([]); // [{id, datasetId, title, payload, figure}]
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const colNames = columns.map((c) => c.name);
  const numericNames = columns.filter((c) => c.type === "numeric").map((c) => c.name);

  useEffect(() => {
    if (!datasetId) return;
    api.suggestions(datasetId)
      .then((r) => {
        setSuggestions(r.suggestions);
        if (r.chartTypes) setChartTypes(r.chartTypes.map((t) => [t, t[0].toUpperCase() + t.slice(1).replace("_", " ")]));
      })
      .catch(() => {});
    setCfg({ type: "bar", x: "", y: "", group: "", size: "", agg: "", title: "", filters: [] });
    setFigures([]);
  }, [datasetId]);

  const figuresRef = useRef([]);
  figuresRef.current = figures;

  // keep saved charts in sync with the current (cleaned) dataset
  const counterSeen = useRef(0);
  useEffect(() => {
    if (!mutateCounter) return;
    const firstLoad = counterSeen.current === 0;
    counterSeen.current = mutateCounter;
    if (firstLoad || figuresRef.current.length === 0) return;
    const stale = figuresRef.current;
    let alive = true;
    setRefreshing(true);
    Promise.all(
      stale.map((f) =>
        f.datasetId !== datasetId
          ? Promise.resolve(f)
          : api.chart({ datasetId, ...f.payload, filters: f.payload.filters || [] })
              .then((res) => ({ ...f, figure: res.figure }))
              .catch(() => ({ ...f, stale: true }))
      )
    ).then((fs) => {
      if (alive) setFigures(fs);
    }).finally(() => {
      if (alive) setRefreshing(false);
    });
    return () => { alive = false; };
  }, [mutateCounter, datasetId]);

  // report chart metadata (with ids/refs) up to App for exports
  useEffect(() => {
    onChartsChange?.(figuresRef.current.map(({ id, title }) => ({ id, title })));
  }, [figures]);

  const set = (k, v) => setCfg((c) => ({ ...c, [k]: v }));

  const applySuggestion = (s) => {
    setCfg({ type: s.type, x: s.x || "", y: s.y || "", group: s.group || "", size: s.size || "", agg: s.agg || "", title: s.title || "", filters: [] });
  };

  async function generate() {
    setBusy(true); setError("");
    const payload = {
      type: cfg.type,
      x: cfg.x || null,
      y: cfg.y || null,
      group: cfg.group || null,
      size: cfg.size || null,
      agg: cfg.agg || null,
      title: cfg.title || null,
      filters: cfg.filters,
    };
    try {
      const res = await api.chart({ datasetId, ...payload });
      const fig = {
        id: `${Date.now()}${Math.random().toString(16).slice(2, 6)}`,
        datasetId,
        title: cfg.title || suggestedTitle(cfg),
        payload,
        figure: res.figure,
      };
      setFigures((f) => [...f, fig].slice(-12));
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  }

  function removeFilter(i) { setCfg((c) => ({ ...c, filters: c.filters.filter((_, j) => j !== i) })); }
  function addFilter() { setCfg((c) => ({ ...c, filters: [...(c.filters || []), { col: colNames[0] || "", op: "eq", value: "" }] })); }
  function setFilter(i, k, v) { setCfg((c) => ({ ...c, filters: c.filters.map((f, j) => (j === i ? { ...f, [k]: v } : f)) })); }

  async function downloadImage(figId, format) {
    const node = chartRefs?.current?.[figId];
    const dataUrl = await chartToImage(node, { format, width: 1100, height: 620 });
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `chart.${format}`;
    a.click();
  }

  return (
    <Card id="charts">
      <CardHeader
        title="4 · Interactive chart builder"
        description="Pick a chart type, columns, grouping, aggregation and filters. Charts based on actual computed results — no mockups."
        icon={<span>📈</span>}
        actions={refreshing ? <Badge tone="blue"><Spinner className="h-3 w-3" /> Refreshing charts on cleaned data…</Badge> : null}
      />
      <CardBody>
        {!datasetId ? (
          <EmptyState title="Load a dataset to build charts" icon="📊" />
        ) : (
          <>
            {suggestions.length > 0 && (
              <div className="mb-3">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">✨ Recommended for this dataset</p>
                <div className="scroll-thin flex gap-2 overflow-x-auto pb-1">
                  {suggestions.map((s, i) => (
                    <button key={i} onClick={() => applySuggestion(s)} title={s.why}
                      className="whitespace-nowrap rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-medium text-blue-700 transition-colors hover:bg-blue-100">
                      <span className="capitalize">{s.type.replace("_", " ")}</span> · {s.title}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-5">
              <Field label="Chart type">
                <Select value={cfg.type} onChange={(e) => set("type", e.target.value)}>
                  {(chartTypes || chartOptions).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              </Field>
              <Field label="X axis"><Select value={cfg.x} onChange={(e) => set("x", e.target.value)}><option value="">— none —</option>{colNames.map((c) => <option key={c}>{c}</option>)}</Select></Field>
              <Field label="Y axis"><Select value={cfg.y} onChange={(e) => set("y", e.target.value)}><option value="">— none —</option>{numericNames.map((c) => <option key={c}>{c}</option>)}</Select></Field>
              <Field label="Group / color by"><Select value={cfg.group} onChange={(e) => set("group", e.target.value)}><option value="">— none —</option>{colNames.map((c) => <option key={c}>{c}</option>)}</Select></Field>
              <Field label="Aggregation"><Select value={cfg.agg} onChange={(e) => set("agg", e.target.value)}>{aggOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
            </div>

            <div className="mt-2.5 grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-5">
              <Field label="Bubble size (optional)">
                <Select value={cfg.size} onChange={(e) => set("size", e.target.value)}>
                  <option value="">— none —</option>{numericNames.map((c) => <option key={c}>{c}</option>)}
                </Select>
              </Field>
              <Field label="Title" className="col-span-2">
                <Input placeholder="Chart title (optional)" value={cfg.title} onChange={(e) => set("title", e.target.value)} />
              </Field>
            </div>

            {(cfg.filters?.length || 0) > 0 && (
              <div className="mt-3 space-y-2">
                {cfg.filters.map((f, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-slate-50/70 px-3 py-2">
                    <span className="text-xs font-medium text-muted">Filter {i + 1}</span>
                    <Select className="w-40" value={f.col} onChange={(e) => setFilter(i, "col", e.target.value)}>{colNames.map((c) => <option key={c}>{c}</option>)}</Select>
                    <Select className="w-36" value={f.op} onChange={(e) => setFilter(i, "op", e.target.value)}>{filterOps.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
                    <Input className="w-36" placeholder="value" value={f.value} onChange={(e) => setFilter(i, "value", e.target.value)} />
                    <Button variant="ghost" size="sm" onClick={() => removeFilter(i)}>✕</Button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button onClick={generate} disabled={busy}>{busy ? <Spinner className="text-white" /> : "＋"} Generate chart</Button>
              <Button variant="outline" onClick={addFilter}>＋ Add filter</Button>
              {error && <ErrorNote>{error}</ErrorNote>}
            </div>

            {figures.length > 0 && (
              <div className="mt-4 grid grid-cols-1 gap-4">
                {figures.map((f) => (
                  <div key={f.id} className="rounded-xl border border-line p-2">
                    <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                      <p className="flex items-center gap-2 truncate text-sm font-semibold text-slate-700">
                        {f.title}
                        {f.stale && <Badge tone="amber">stale — column/config no longer valid</Badge>}
                      </p>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => downloadImage(f.id, "png")}>PNG ↓</Button>
                        <Button variant="ghost" size="sm" onClick={() => downloadImage(f.id, "svg")}>SVG ↓</Button>
                        <Button variant="ghost" size="sm" onClick={() => setFigures((fs) => fs.filter((x) => x.id !== f.id))}>✕</Button>
                      </div>
                    </div>
                    <Plot
                      key={f.id}
                      figure={f.figure}
                      height={400}
                      innerRef={(n) => { if (chartRefs) chartRefs.current[f.id] = n; }}
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

function Field({ label, children, className }) {
  return (
    <label className={`block ${className || ""}`}>
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  );
}
