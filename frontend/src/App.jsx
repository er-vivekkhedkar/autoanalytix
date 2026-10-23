import React, { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import Header from "./components/Header.jsx";
import UploadPanel from "./components/UploadPanel.jsx";
import Overview from "./components/Overview.jsx";
import CleaningPanel from "./components/CleaningPanel.jsx";
import ChartBuilder from "./components/ChartBuilder.jsx";
import StatsPanel from "./components/StatsPanel.jsx";
import DataPreview from "./components/DataPreview.jsx";
import ExportPanel from "./components/ExportPanel.jsx";
import { Section } from "./ui/primitives.jsx";

export default function App() {
  const [datasetId, setDatasetId] = useState(null);
  const [meta, setMeta] = useState(null);
  const [profile, setProfile] = useState(null);
  const [charts, setCharts] = useState([]);
  const [mutateCounter, setMutateCounter] = useState(0);
  const [toast, setToast] = useState(null); // {kind, text}
  const [offline, setOffline] = useState(false);
  const chartRefs = useRef({});

  useEffect(() => {
    api.health().catch(() => setOffline(true));
  }, []);

  useEffect(() => {
    if (!datasetId) { setProfile(null); setMeta(null); return; }
    api.profile(datasetId).then((p) => { setProfile(p); setMeta({ ...p, name: p.name }); }).catch((e) => showError(e.message));
  }, [datasetId, mutateCounter]);


  function showError(text) {
    setToast({ kind: "error", text });
    setTimeout(() => setToast(null), 5000);
  }

  function onLoaded(res) {
    setDatasetId(res.datasetId || res.id);
    setMutateCounter((c) => c + 1);
    setCharts([]);
    showNote(`Dataset loaded — profiled automatically.`);
    if (window.innerWidth < 1024) document.getElementById("overview")?.scrollIntoView({ behavior: "smooth" });
  }

  function onMutated(res) {
    setMutateCounter((c) => c + 1);
    if (res?.undone) showNote(res.undone);
  }

  function showNote(text) {
    setToast({ kind: "ok", text });
    setTimeout(() => setToast(null), 3500);
  }

  async function reset() {
    if (datasetId) {
      try {
        await api.deleteDataset(datasetId);
      } catch (e) {
        console.error("Failed to delete dataset:", e);
      }
    }
    setDatasetId(null);
    setMeta(null);
    setProfile(null);
    setCharts([]);
    document.getElementById("upload")?.scrollIntoView({ behavior: "smooth" });
  }

  const columns = profile?.profile?.columns || [];

  return (
    <div className="min-h-screen">
      <Header meta={meta} onReset={reset} />

      {offline && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-xs text-amber-800">
          Backend not reachable on port 8000 — start it with <code className="rounded bg-amber-100 px-1">uvicorn main:app</code> in <b>autoanalytix/backend</b>.
        </div>
      )}

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
        <Section id="hero" className="pt-2 text-center">
          <h1 className="mx-auto max-w-2xl text-2xl font-extrabold tracking-tight sm:text-3xl">
            Analyze any dataset in minutes — <span className="text-blue-600">no code required</span>
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted">
            Upload → profile → clean with explained recommendations → visualize → download results.
            Powered by FastAPI + Pandas on the server and Plotly in your browser.
          </p>
        </Section>

        <UploadPanel onLoaded={onLoaded} />
        <Overview datasetId={datasetId} profile={profile} meta={meta} />
        <CleaningPanel datasetId={datasetId} meta={meta} onMutated={onMutated} />
        <ChartBuilder datasetId={datasetId} columns={columns} mutateCounter={mutateCounter} onChartsChange={setCharts} chartRefs={chartRefs} />
        <StatsPanel datasetId={datasetId} columns={columns} mutateCounter={mutateCounter} />
        <DataPreview datasetId={datasetId} mutateCounter={mutateCounter} />
        <ExportPanel datasetId={datasetId} meta={meta} chartMetas={charts} chartRefs={chartRefs} />

        <footer className="py-6 text-center text-[11px] text-muted">
          AutoAnalytix · original data is never modified · cleaning is always review-then-apply
        </footer>
      </main>

      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-50 max-w-sm rounded-xl px-4 py-3 text-sm shadow-lg ${
            toast.kind === "error" ? "bg-rose-600 text-white" : "bg-slate-900 text-white"
          }`}
        >
          <span className="mr-1">{toast.kind === "error" ? "⚠️" : "✅"}</span>
          {toast.text}
        </div>
      )}
    </div>
  );
}
