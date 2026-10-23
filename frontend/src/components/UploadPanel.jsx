import React, { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { Button, Card, CardBody, CardHeader, ErrorNote, Spinner } from "../ui/primitives.jsx";

const MAX_MB = 10;

export default function UploadPanel({ onLoaded }) {
  const [samples, setSamples] = useState([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef(null);

  useEffect(() => {
    api.listSamples().then(setSamples).catch(() => {});
  }, []);

  async function handleFile(file) {
    if (!file) return;
    if (!/\.(csv|json)$/i.test(file.name)) {
      setError("Only .csv or .json files are supported.");
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`File is ${(file.size / 1e6).toFixed(1)} MB — the limit is ${MAX_MB} MB.`);
      return;
    }
    setError("");
    setBusy(true);
    try {
      const res = await api.upload(file);
      onLoaded(res, false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function loadSample(id) {
    setError("");
    setBusy(true);
    try {
      const res = await api.loadSample(id);
      onLoaded({ ...res, name: id.charAt(0).toUpperCase() + id.slice(1) + " (sample)" }, true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card id="upload">
      <CardHeader
        title="1 · Upload your data"
        description="Drop a CSV or JSON file (up to 10 MB) — or start with a built-in sample. Your file is validated and profiled instantly."
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4m0 0 4 4m-4-4L8 8" /><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>}
      />
      <CardBody>
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInput.current?.click()}
          onKeyDown={(e) => e.key === "Enter" && fileInput.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files?.[0]); }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-9 text-center transition-colors ${
            dragging ? "border-blue-400 bg-blue-50/70" : "border-slate-200 bg-slate-50/50 hover:border-blue-300 hover:bg-blue-50/40"
          }`}
        >
          {busy ? (
            <span className="flex items-center gap-2 text-sm text-slate-600"><Spinner /> Processing file…</span>
          ) : (
            <>
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4m0 0 4 4m-4-4L8 8" /><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
              </span>
              <p className="text-sm font-medium text-slate-700">Drag &amp; drop your CSV / JSON here</p>
              <p className="text-xs text-muted">or click to browse · max {MAX_MB} MB</p>
            </>
          )}
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.json,text/csv,application/json"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </div>

        <ErrorNote className="mt-3">{error}</ErrorNote>

        {samples.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Built-in sample datasets</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {samples.map((s) => (
                <Button variant="outline" key={s.id} onClick={() => loadSample(s.id)} disabled={busy} className="justify-start">
                  <span className="text-blue-600">◈</span> {s.label}
                </Button>
              ))}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
