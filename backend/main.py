"""AutoAnalytix FastAPI backend."""
import io
import json
import os
import uuid
import zipfile

import pandas as pd
import plotly.io as pio
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

import engine
import report as report_mod

# Redis for persistent storage
import redis
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
USE_KV = False
kv = None
try:
    kv = redis.from_url(REDIS_URL, decode_responses=True)
    kv.ping()
    USE_KV = True
    print(f"Connected to Redis: {REDIS_URL}")
except Exception as e:
    print(f"Failed to connect to Redis: {e}. Using in-memory storage.")
    USE_KV = False
    kv = None

MAX_UPLOAD = 10 * 1024 * 1024  # 10 MB
MAX_ROWS = engine.MAX_ROWS
MAX_COLS = engine.MAX_COLS
MAX_HISTORY = 25

SAMPLES_DIR = os.path.join(os.path.dirname(__file__), "samples")
SAMPLES = {"iris": ("Iris", "iris.csv"), "titanic": ("Titanic", "titanic.csv"),
           "tips": ("Tips", "tips.csv")}

DATASTORE: dict[str, dict] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    DATASTORE.clear()


app = FastAPI(title="AutoAnalytix", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, 
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"], 
    allow_headers=["*"],
)


# ------------------------------------------------------------------ helpers
def _serialize_session(session: dict) -> str:
    """Serialize session data for KV storage."""
    return json.dumps({
        "id": session["id"],
        "name": session["name"],
        "original": engine.safe_records(session["original"]),
        "df": engine.safe_records(session["df"]),
        "history": [{"label": h["label"], "rows": h["rows"], "df": engine.safe_records(h["df"])} for h in session["history"]],
        "applied": session["applied"],
    }, default=str)


def _deserialize_session(data: str) -> dict:
    """Deserialize session data from KV storage."""
    obj = json.loads(data)
    return {
        "id": obj["id"],
        "name": obj["name"],
        "original": pd.DataFrame(obj["original"]),
        "df": pd.DataFrame(obj["df"]),
        "history": [{"label": h["label"], "rows": h["rows"], "df": pd.DataFrame(h["df"])} for h in obj["history"]],
        "applied": obj["applied"],
    }


async def _get_session(dataset_id: str) -> dict:
    """Get session from Redis or in-memory DATASTORE."""
    if USE_KV:
        data = kv.get(f"dataset:{dataset_id}")
        if data is None:
            raise HTTPException(404, "Dataset not found — it may have been reset by a server restart. Please re-upload.")
        return _deserialize_session(data)
    else:
        if dataset_id not in DATASTORE:
            raise HTTPException(404, "Dataset not found — it may have been reset by a server restart. Please re-upload.")
        return DATASTORE[dataset_id]


async def _save_session(dataset_id: str, session: dict):
    """Save session to Redis or in-memory DATASTORE."""
    if USE_KV:
        kv.set(f"dataset:{dataset_id}", _serialize_session(session))
        # Set expiration to 24 hours
        kv.expire(f"dataset:{dataset_id}", 86400)
    else:
        DATASTORE[dataset_id] = session


def _session(dataset_id: str, check=True):
    if dataset_id not in DATASTORE:
        raise HTTPException(404, "Dataset not found — it may have been reset by a server restart. Please re-upload.")
    return DATASTORE[dataset_id]


async def _new_session(df: pd.DataFrame, name: str):
    dataset_id = uuid.uuid4().hex[:12]
    session = {
        "id": dataset_id,
        "name": name,
        "original": df.copy(),
        "df": df.copy(),
        "history": [],  # [{label, df, rows}]
        "applied": [],  # change descriptions
    }
    await _save_session(dataset_id, session)
    return dataset_id


def parse_upload(filename: str, raw: bytes) -> pd.DataFrame:
    if len(raw) > MAX_UPLOAD:
        raise HTTPException(413, f"File too large ({len(raw) / 1e6:.1f} MB). The limit is 10 MB.")
    low = filename.lower()
    try:
        if low.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(raw))
        elif low.endswith(".json"):
            obj = json.loads(raw.decode("utf-8", errors="replace"))
            if isinstance(obj, dict):  # allow {records}, nested dict of scalars, list under any key
                records = None
                if all(not isinstance(v, (list, dict)) for v in obj.values()):
                    obj = [obj]
                else:
                    for v in obj.values():
                        if isinstance(v, list) and v and isinstance(v[0], dict):
                            records = v
                            break
                if records is not None:
                    obj = records
            df = pd.json_normalize(obj, max_level=1)
        else:
            raise HTTPException(415, "Unsupported file type. Upload a .csv or .json file.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(422, f"Could not parse the file: {e.__class__.__name__}: {e}")
    df = _normalize_df(df, filename)
    return df


def _normalize_df(df: pd.DataFrame, name: str) -> pd.DataFrame:
    if df.empty or df.shape[1] == 0:
        raise HTTPException(422, "The file has no usable rows or columns.")
    if df.shape[1] > MAX_COLS:
        raise HTTPException(413, f"Too many columns ({df.shape[1]}). The limit is {MAX_COLS}.")
    if len(df) > MAX_ROWS:
        raise HTTPException(413, f"Too many rows ({len(df):,}). The limit is {MAX_ROWS:,}.")
    df = df.copy()
    df.columns = [str(c).strip() for c in df.columns]
    # dedupe identical column names
    dup = pd.Series(df.columns).duplicated(keep=False)
    if dup.any():
        seen = {}
        newcols = []
        for c in df.columns:
            n = seen.get(c, 0)
            newcols.append(c if n == 0 else f"{c}.{n + 1}")
            seen[c] = n + 1
        df.columns = newcols
    # drop fully-empty columns
    if df.shape[1] > 1:
        empty_cols = [c for c, allna in df.isna().all().items() if allna]
        if empty_cols and len(empty_cols) < df.shape[1]:
            df = df.drop(columns=empty_cols)
    if all(not engine.infer_kind(df[c]) for c in df.columns) and len(df.columns) == 0:
        raise HTTPException(422, "No usable data columns found in the file.")
    return df


def _dataset_meta(s):
    prof = engine.profile(s["df"])
    return {
        "id": s["id"],
        "name": s["name"],
        "rows": prof["rows"],
        "cols": prof["cols"],
        "originalRows": len(s["original"]),
        "originalCols": s["original"].shape[1],
        "canUndo": len(s["history"]) > 0,
        "changes": len(s["applied"]),
    }


class ActionIn(BaseModel):
    actionType: str
    column: str | None = None
    method: str | None = None
    columns: list[str] | None = None
    lower: float | None = None
    upper: float | None = None


class ApplyIn(BaseModel):
    actions: list[ActionIn]


class ChartIn(BaseModel):
    datasetId: str
    type: str
    x: str | None = None
    y: str | None = None
    group: str | None = None
    size: str | None = None
    agg: str | None = None
    title: str | None = None
    filters: list[dict] | None = None


class RegressionIn(BaseModel):
    datasetId: str
    x: str
    y: str


class ChartImage(BaseModel):
    name: str
    dataUrl: str


class ReportIn(BaseModel):
    datasetId: str
    charts: list[ChartImage] | None = None


# ------------------------------------------------------------------ basic
@app.get("/api/health")
def health():
    return {"ok": True, "redis": USE_KV, "redis_url": REDIS_URL if USE_KV else "not connected"}


@app.post("/api/upload")
async def upload(file: UploadFile = File(...)):
    raw = await file.read()
    df = parse_upload(file.filename or "data.csv", raw)
    dsid = await _new_session(df, os.path.basename(file.filename or "upload"))
    s = await _get_session(dsid)
    return {"datasetId": dsid, **_dataset_meta(s)}


@app.get("/api/samples")
def list_samples():
    return [{"id": k, "label": v[0]} for k, v in SAMPLES.items()]


@app.post("/api/sample/{sample_id}")
async def load_sample(sample_id: str):
    if sample_id not in SAMPLES:
        raise HTTPException(404, "Unknown sample dataset.")
    label, fname = SAMPLES[sample_id]
    path = os.path.join(SAMPLES_DIR, fname)
    if not os.path.exists(path):
        raise HTTPException(500, f"Sample file missing on server: {fname}")
    df = pd.read_csv(path)
    dsid = await _new_session(df, label)
    s = await _get_session(dsid)
    return {"datasetId": dsid, **_dataset_meta(s)}


@app.get("/api/dataset/{dataset_id}")
async def dataset_meta(dataset_id: str):
    s = await _get_session(dataset_id)
    meta = _dataset_meta(s)
    meta["columns"] = engine.profile(s["df"])["columns"]
    return meta


@app.delete("/api/dataset/{dataset_id}")
async def delete_dataset(dataset_id: str):
    await _get_session(dataset_id)
    if USE_KV:
        kv.delete(f"dataset:{dataset_id}")
    else:
        DATASTORE.pop(dataset_id, None)
    return {"ok": True}


# ------------------------------------------------------------------ profiling
@app.get("/api/profile/{dataset_id}")
async def get_profile(dataset_id: str):
    s = await _get_session(dataset_id)
    return {**_dataset_meta(s), "profile": engine.profile(s["df"]),
            "original": {"rows": len(s["original"]), "cols": s["original"].shape[1],
                         "missingCells": int(s["original"].isna().sum().sum()),
                         "duplicates": int(s["original"].duplicated().sum())}}


@app.get("/api/stats/{dataset_id}")
async def get_stats(dataset_id: str):
    s = await _get_session(dataset_id)
    return {"numeric": engine.descriptive_stats(s["df"]),
            "frequencies": engine.frequency_tables(s["df"]),
            "correlations": engine.correlations(s["df"])}


@app.post("/api/stats/regression")
async def do_regression(body: RegressionIn):
    s = await _get_session(body.datasetId)
    if body.x not in s["df"].columns or body.y not in s["df"].columns:
        raise HTTPException(400, "X and Y columns must exist in the dataset.")
    try:
        return engine.regression(s["df"], body.x, body.y)
    except ValueError as e:
        raise HTTPException(400, str(e))


# ------------------------------------------------------------------ cleaning
@app.get("/api/cleaning/{dataset_id}")
async def cleaning_recs(dataset_id: str):
    s = await _get_session(dataset_id)
    return {"recommendations": engine.recommendations(s["df"]),
            "history": [{"label": h["label"], "rows": h["rows"]} for h in reversed(s["history"][::-1][-25:])],
            "applied": s["applied"][-25:]}


@app.post("/api/cleaning/apply/{dataset_id}")
async def cleaning_apply(dataset_id: str, body: ApplyIn):
    s = await _get_session(dataset_id)
    if not body.actions:
        raise HTTPException(400, "No actions provided.")
    s["history"].append({"label": f"{len(body.actions)} action(s) applied",
                         "df": s["df"].copy(), "rows": len(s["df"]),
                         "changes": len(body.actions)})
    if len(s["history"]) > MAX_HISTORY:
        s["history"].pop(0)
    changes = []
    for a in body.actions:
        try:
            s["df"], desc = engine.apply_action(s["df"], a.model_dump(exclude_none=True))
            changes.append(desc)
        except (ValueError, KeyError) as e:
            raise HTTPException(400, f"Action failed: {e}")
    s["applied"] = (s["applied"] + changes)[-25:]
    await _save_session(dataset_id, s)
    return {**_dataset_meta(s), "changes": changes}


@app.post("/api/cleaning/undo/{dataset_id}")
async def cleaning_undo(dataset_id: str):
    s = await _get_session(dataset_id)
    if not s["history"]:
        raise HTTPException(400, "Nothing to undo.")
    prev = s["history"].pop()
    s["df"] = prev["df"]
    if prev.get("changes") and s["applied"]:
        s["applied"] = s["applied"][:-min(prev["changes"], len(s["applied"]))]
    await _save_session(dataset_id, s)
    return {**_dataset_meta(s), "undone": "Reverted the last cleaning step. The previous dataset state was restored."}


# ------------------------------------------------------------------ data preview
@app.get("/api/data/{dataset_id}")
async def preview_data(dataset_id: str, limit: int = 50, offset: int = 0, original: str = "current"):
    s = await _get_session(dataset_id)
    df = s["original"] if original == "original" else s["df"]
    limit = max(1, min(limit, 500))
    return {
        "columns": [str(c) for c in df.columns],
        "rows": [list(r.values()) for r in engine.safe_records(df.iloc[offset:offset + limit])],
        "total": len(df),
        "offset": offset,
        "limit": limit,
    }


# ------------------------------------------------------------------ charts
@app.get("/api/chart/suggest/{dataset_id}")
async def chart_suggest(dataset_id: str):
    s = await _get_session(dataset_id)
    return {"suggestions": engine.suggest_charts(s["df"]),
            "chartTypes": engine.CHART_TYPES}


@app.post("/api/chart")
async def chart(body: ChartIn):
    s = await _get_session(body.datasetId)
    df = engine.filter_df(s["df"], body.filters)
    if df.empty:
        raise HTTPException(400, "The filter conditions matched no rows. Relax the filters.")
    cfg = body.model_dump(exclude={"datasetId", "filters"})
    title = cfg.pop("title", None)
    try:
        fig = engine.build_figure(df, cfg, title=title)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"Chart error: {e}")
    return JSONResponse({"figure": json.loads(pio.to_json(fig)), "title": title})


# ------------------------------------------------------------------ exports
@app.get("/api/export/{dataset_id}/{kind}")
async def export_data(dataset_id: str, kind: str):
    s = await _get_session(dataset_id)
    df = s["df"]
    base = os.path.splitext(s["name"])[0] or "cleaned"
    if kind == "csv":
        buf = io.StringIO()
        df.to_csv(buf, index=False)
        return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                                 headers={"Content-Disposition": f'attachment; filename="{base}_cleaned.csv"'})
    elif kind == "json":
        text = json.dumps(engine.safe_records(df), ensure_ascii=False)
        return StreamingResponse(iter([text]), media_type="application/json",
                                 headers={"Content-Disposition": f'attachment; filename="{base}_cleaned.json"'})
    raise HTTPException(400, "kind must be csv or json")


@app.post("/api/export/report")
async def export_report(body: ReportIn):
    s = await _get_session(body.datasetId)
    charts_meta = [c.name for c in (body.charts or [])]
    try:
        pdf = report_mod.build_pdf(s["df"], s["name"], s["applied"], charts_meta)
    except Exception as e:
        raise HTTPException(500, f"Report generation failed: {e}")
    base = os.path.splitext(s["name"])[0] or "report"
    return StreamingResponse(iter([pdf]), media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="AutoAnalytix_{base}_report.pdf"'})


@app.post("/api/export/zip")
async def export_zip(body: ReportIn):
    s = await _get_session(body.datasetId)
    df = s["df"]
    base = os.path.splitext(s["name"])[0] or "cleaned"
    z = io.BytesIO()
    with zipfile.ZipFile(z, "w", zipfile.ZIP_DEFLATED) as zf:
        csv_txt = df.to_csv(index=False)
        zf.writestr(f"{base}_cleaned.csv", csv_txt)
        zf.writestr(f"{base}_cleaned.json", json.dumps(engine.safe_records(df), ensure_ascii=False))
        stats = {"numeric": engine.descriptive_stats(df), "correlations": engine.correlations(df)}
        zf.writestr(f"{base}_statistics.json", json.dumps(stats, ensure_ascii=False, default=str))
        charts_meta = [c.name for c in (body.charts or [])]
        pdf = report_mod.build_pdf(df, s["name"], s["applied"], charts_meta)
        zf.writestr(f"AutoAnalytix_{base}_report.pdf", pdf)
        for c in (body.charts or []):
            if c.dataUrl and c.dataUrl.startswith("data:"):
                try:
                    b64 = c.dataUrl.split(",", 1)[1]
                    import base64
                    zf.writestr(f"charts/{c.name}.png", base64.b64decode(b64))
                except Exception:
                    pass
    z.seek(0)
    return StreamingResponse(iter([z.getvalue()]), media_type="application/zip",
                             headers={"Content-Disposition": f'attachment; filename="AutoAnalytix_{base}.zip"'})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
