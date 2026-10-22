# AutoAnalytix 🚀

A responsive, single-page, **no-code data analytics web app** — upload a CSV/JSON, get automated profiling, explainable cleaning recommendations, interactive Plotly charts, statistics, and downloadable results.

**Stack:** React 18 + Vite + Tailwind CSS (frontend) · FastAPI + Pandas + NumPy + SciPy + Plotly + ReportLab (backend)

## Run it

**Backend** (first time: creates a local venv and installs deps):

```
cd backend
python -m venv venv                 # once
venv\Scripts\python -m pip install -r requirements.txt   # once (Windows)
venv\Scripts\python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

**Frontend:**

```
cd frontend
npm install        # once
npm run dev        # http://localhost:5173
```

The Vite dev server proxies `/api/*` to the backend on port 8000 — no CORS setup needed.

## Workflow

1. **Upload** a CSV/JSON (drag & drop, ≤10 MB) or load a built-in sample (**Iris**, **Titanic**, **Tips** — real datasets, stored in `backend/samples/`).
2. **Overview** profiles the dataset instantly: rows, columns, types, missing values, duplicates, min–max per column.
3. **Smart cleaning** scans for missing values, duplicates, wrong implicit types and IQR outliers, then proposes actions with plain-English reasons (mean for symmetric numerics, median for skewed/outlier-heavy data, mode for categoricals, capping/removal options). You review and apply — **row/column removal always requires your approval** and the **original dataset is never modified**. Every step is undoable.
4. **Chart builder** supports bar, line, pie, donut, area, histogram, scatter, bubble, box, violin, strip, ECDF, heatmap, density heatmap and contour, with X/Y, grouping, aggregation (count/mean/median/sum/min/max/nunique) and multiple row filters. One-click dataset-aware suggestions. Multiple charts; PNG/SVG downloads.
5. **Statistics** gives means, medians, modes, variance/std, quartiles, skew, frequency tables, a Pearson correlation matrix — plus optional linear regression.
6. **Data preview** with pagination and an Original ↔ Cleaned switch.
7. **Export:** cleaned CSV/JSON, PDF report (profile, stats, cleaning log, top correlations), chart PNGs, and a complete ZIP package.

## Notes

- The backend keeps sessions in memory (per process). Restarting the backend resets loaded datasets; the UI detects this and asks you to re-upload.
- Recursive/session store limit: 250k rows × 200 columns × 10 MB per upload.
- PDF report generation uses ReportLab on the server; chart PNGs are captured client-side from the rendered Plotly DOM.
