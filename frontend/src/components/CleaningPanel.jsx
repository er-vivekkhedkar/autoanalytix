import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, ErrorNote, Select, Spinner, severityTone } from "../ui/primitives.jsx";

const issueMeta = {
  missing: { label: "Missing values", icon: "◍" },
  duplicates: { label: "Duplicates", icon: "⧉" },
  type: { label: "Wrong type", icon: "⇄" },
  outliers: { label: "Outliers", icon: "◈" },
};

const methodChoices = [
  ["mean", "Mean"],
  ["median", "Median"],
  ["mode", "Mode"],
  ["drop_rows", "Drop rows"],
  ["drop_col", "Remove column"],
  ["keep", "Do nothing"],
];

/** Build the list of backend actions for the chosen user decisions. */
function actionsFor(rec, decisions) {
  const a = rec.action;
  const d = decisions[rec.id] || "recommended";
  const methodFor = { mean: "mean", median: "median", mode: "mode" };

  if (a.actionType === "drop_duplicates" && d === "recommended") return [a];
  if (a.actionType === "convert_numeric" && d === "recommended") return [a];
  if (a.actionType === "keep_outliers") return []; // informational only

  if (a.actionType === "impute" || a.actionType === "drop_column" || a.actionType === "cap_outliers" || a.actionType === "remove_outliers") {
    if (d === "recommended") {
      if (a.actionType === "drop_rows_for_missing" || d === "keep") return [];
      return [a];
    }
    if (d === "keep") return [];
    if (d === "drop_rows") return [{ actionType: "drop_rows_missing", columns: [rec.column] }];
    if (d === "drop_col") return [{ actionType: "drop_column", column: rec.column }];
    if (methodFor[d]) return [{ actionType: "impute", column: rec.column, method: d }];
  }
  if (d === "recommended") return [a];
  if (d === "keep") return [];
  return [a];
}

export default function CleaningPanel({ datasetId, meta, onMutated }) {
  const [recs, setRecs] = useState(null);
  const [decisions, setDecisions] = useState({});
  const [applied, setApplied] = useState([]);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [expandedGroups, setExpandedGroups] = useState({});

  const refresh = () => {
    if (!datasetId) return;
    api.cleaning(datasetId)
      .then((r) => { setRecs(r.recommendations); setApplied(r.applied || []); setHistory(r.history || []); })
      .catch((e) => setError(e.message));
  };

  useEffect(refresh, [datasetId]);
  useEffect(() => { setDecisions({}); }, [datasetId]);

  if (!datasetId) {
    return (
      <Card id="cleaning">
        <CardHeader title="3 · Smart data cleaning" icon={<span>🧹</span>} />
        <CardBody><EmptyState title="Nothing to clean yet" hint="Load a dataset — AutoAnalytix will scan it for missing values, duplicates, wrong types and outliers." icon="✨" /></CardBody>
      </Card>
    );
  }

  const toggle = (id, v) => setDecisions((d) => ({ ...d, [id]: v }));
  const allIds = (recs || []).filter((r) => r.action.actionType !== "keep_outliers").map((r) => r.id);

  async function apply(selectedIds) {
    setBusy(true); setError(""); setNote("");
    let actions = [];
    for (const r of recs) {
      if (!selectedIds.includes(r.id)) continue;
      actions.push(...actionsFor(r, decisions));
    }
    if (!actions.length) { setBusy(false); setNote("Nothing selected to apply — keep recommendations as suggested or choose actions."); return; }
    try {
      const res = await api.apply(datasetId, actions);
      setNote(res.changes.join(" · ") || "Applied.");
      refresh();
      onMutated?.(res);
    } catch (e) {
      setError(e.message);
      refresh();
      onMutated?.();
    } finally { setBusy(false); }
  }

  async function undo() {
    setBusy(true); setError("");
    try {
      const res = await api.undo(datasetId);
      setNote(res.undone);
      refresh();
      onMutated?.(res);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  const actionable = (recs || []).filter((r) => r.action.actionType !== "keep_outliers");
  const suggestions = (recs || []).filter((r) => r.action.actionType === "keep_outliers");

  // Group actionable recommendations by issue type
  const groupedByIssue = actionable.reduce((acc, r) => {
    const issue = r.issue;
    if (!acc[issue]) acc[issue] = [];
    acc[issue].push(r);
    return acc;
  }, {});

  return (
    <Card id="cleaning">
      <CardHeader
        title="3 · Smart data cleaning"
        description="Explainable, safe recommendations. Nothing is changed until you review and apply it — the original dataset is always preserved."
        icon={<span>🧹</span>}
        actions={
          <>
            {meta?.canUndo && <Button variant="outline" size="sm" onClick={undo} disabled={busy}>↩ Undo last</Button>}
            {actionable.length > 0 && (
              <Button size="sm" onClick={() => apply(actionable.map((r) => r.id))} disabled={busy}>
                {busy ? <Spinner className="text-white" /> : null} Apply all ({actionable.length})
              </Button>
            )}
          </>
        }
      />
      <CardBody>
        <ErrorNote className="mb-3">{error}</ErrorNote>
        {note && !error && <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{note}</div>}

        {!recs ? (
          <EmptyState title="Analyzing…" icon={<Spinner className="h-5 w-5" />} />
        ) : actionable.length === 0 && suggestions.length === 0 ? (
          <EmptyState title="No cleaning issues found 🎉" hint="This dataset already looks tidy — no missing values, duplicates or obvious outliers detected." />
        ) : (
          <div className="space-y-3">
            {Object.entries(groupedByIssue).map(([issue, recs]) => {
              const im = issueMeta[issue] || {};
              const isExpanded = expandedGroups[issue] !== false;
              return (
                <div key={issue} className="rounded-xl border border-line overflow-hidden">
                  <div
                    className="flex cursor-pointer items-center gap-3 border-b border-line bg-slate-50/50 px-4 py-3 hover:bg-slate-50"
                    onClick={() => setExpandedGroups((prev) => ({ ...prev, [issue]: !prev[issue] }))}
                  >
                    <Badge tone={severityTone[recs[0]?.severity]}>{im.icon} {im.label}</Badge>
                    <span className="text-sm text-slate-600">{recs.length} item(s) affected</span>
                    <div className="ml-auto flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); apply(recs.map((r) => r.id)); }}
                        disabled={busy}
                      >
                        {busy ? <Spinner className="text-white" /> : null} Apply all ({recs.length})
                      </Button>
                      <span className="text-slate-400">{isExpanded ? "▼" : "▶"}</span>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="space-y-1 p-3">
                      {recs.map((r) => {
                        const chosen = decisions[r.id] ?? "recommended";
                        const canPickMethod = r.action.actionType === "impute" || r.action.actionType === "drop_column";
                        return (
                          <div key={r.id} className="rounded-lg border border-line px-3 py-2">
                            <div className="flex flex-wrap items-center gap-2">
                              {r.column && <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700">{r.column}</code>}
                              <Badge tone="slate">{r.count} affected</Badge>
                              <div className="ml-auto flex items-center gap-2">
                                {canPickMethod ? (
                                  <Select className="w-36 py-1 text-xs" value={chosen} onChange={(e) => toggle(r.id, e.target.value)}>
                                    <option value="recommended">✨ Recommended</option>
                                    {methodChoices.filter(([, l]) => l)
                                      .filter(([v]) => v !== "drop_rows" || r.action.actionType === "impute")
                                      .filter(([v]) => v !== "drop_col" || true)
                                      .map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                  </Select>
                                ) : (
                                  <Button variant="ghost" size="sm" onClick={() => toggle(r.id, chosen === "keep" ? "recommended" : "keep")}>
                                    {chosen === "keep" ? "↩ Include" : "Skip"}
                                  </Button>
                                )}
                                <Button variant="secondary" size="sm" onClick={() => apply([r.id])} disabled={busy}>
                                  Apply
                                </Button>
                              </div>
                            </div>
                            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-600">{r.reason}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {suggestions.map((r) => (
              <div key={r.id} className="rounded-xl border border-dashed border-line bg-slate-50/70 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="slate">{issueMeta[r.issue]?.icon} {issueMeta[r.issue]?.label}</Badge>
                  <code className="rounded bg-white px-1.5 py-0.5 text-[11px] text-slate-700">{r.column}</code>
                  <Badge tone="slate">{r.count} flagged</Badge>
                </div>
                <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-slate-600">{r.reason}</p>
              </div>
            ))}
          </div>
        )}

        {(applied.length > 0 || history.length > 0) && (
          <div className="mt-4">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Change log (newest first)</p>
            <ol className="scroll-thin max-h-40 space-y-1 overflow-auto rounded-xl border border-line bg-slate-50/70 px-3.5 py-2.5 text-xs text-slate-600">
              {applied.slice().reverse().map((c, i) => <li key={i} className="flex gap-2"><span className="text-emerald-500">✓</span>{c}</li>)}
            </ol>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
