"""AutoAnalytix analysis engine: profiling, stats, cleaning recommendations, charts."""
import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go
import plotly.io as pio
from scipy import stats as scipy_stats

MAX_ROWS = 250_000
MAX_COLS = 200


# ------------------------------------------------------------------ helpers
def json_safe(value):
    """Convert a single value into a JSON-serializable primitive."""
    if value is None:
        return None
    if isinstance(value, (pd.Timestamp, np.datetime64)):
        return str(pd.Timestamp(value).isoformat())
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        f = float(value)
        return None if (np.isnan(f) or np.isinf(f)) else f
    if isinstance(value, (np.bool_, bool)):
        return bool(value)
    if isinstance(value, (np.ndarray,)):
        return [json_safe(v) for v in value.tolist()]
    if pd.isna(value):
        return None
    return str(value)


def safe_records(df):
    """DataFrame -> list of JSON-safe dicts."""
    records = []
    for row in df.itertuples(index=False, name=None):
        records.append({col: json_safe(v) for col, v in zip(df.columns, row)})
    return records


def infer_kind(series):
    """Classify a column for the UI: numeric / categorical / datetime / boolean."""
    if pd.api.types.is_bool_dtype(series):
        return "boolean"
    if pd.api.types.is_numeric_dtype(series):
        return "numeric"
    if pd.api.types.is_datetime64_any_dtype(series):
        return "datetime"
    if hasattr(series, "dt") and getattr(series, "cat", None) is not None:
        return "categorical"
    return "categorical"


def _numeric(series):
    return pd.to_numeric(series, errors="coerce").dropna()


# ------------------------------------------------------------------ profiling
def profile(df):
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    total_missing = int(df.isna().sum().sum())
    duplicated = int(df.duplicated().sum())
    columns = []
    for col in df.columns:
        s = df[col]
        n_missing = int(s.isna().sum())
        nn = s.dropna()
        info = {
            "name": str(col),
            "type": infer_kind(s),
            "dtype": str(s.dtype),
            "missing": n_missing,
            "missingPct": round(n_missing / len(df) * 100, 2) if len(df) else 0,
            "unique": int(nn.nunique()),
        }
        if len(nn):
            info["sample"] = [json_safe(v) for v in nn.head(3).tolist()]
            if info["type"] == "numeric":
                info["min"] = json_safe(nn.min())
                info["max"] = json_safe(nn.max())
                info["mean"] = json_safe(nn.astype(float).mean())
        columns.append(info)
    return {
        "rows": int(len(df)),
        "cols": df.shape[1],
        "numericCols": len(numeric_cols),
        "missingCells": total_missing,
        "missingPct": round(total_missing / (df.size or 1) * 100, 2),
        "duplicates": duplicated,
        "completeRows": int(len(df.dropna())) if len(df) else 0,
        "columns": columns,
    }


def descriptive_stats(df):
    out = {}
    for col in df.select_dtypes(include=[np.number]).columns:
        s = df[col].dropna()
        if s.empty:
            continue
        f = s.astype(float)
        mode_vals = s.mode()
        out[str(col)] = {
            "count": int(s.count()),
            "missing": int(df[col].isna().sum()),
            "mean": json_safe(f.mean()),
            "median": json_safe(f.median()),
            "mode": [json_safe(v) for v in mode_vals.head(3).tolist()],
            "std": json_safe(f.std()),
            "variance": json_safe(f.var()),
            "min": json_safe(f.min()),
            "max": json_safe(f.max()),
            "q1": json_safe(f.quantile(0.25)),
            "q3": json_safe(f.quantile(0.75)),
            "skew": json_safe(f.skew()),
        }
    return out


def frequency_tables(df, top=12):
    out = {}
    for col in df.columns:
        if infer_kind(df[col]) in ("categorical", "boolean"):
            vc = df[col].value_counts(dropna=True).head(top)
            out[str(col)] = [
                {"value": json_safe(v), "count": int(c),
                 "pct": round(c / max(len(df[col].dropna()), 1) * 100, 2)}
                for v, c in vc.items()
            ]
    return out


def correlations(df):
    corr = df.select_dtypes(include=[np.number]).corr(method="pearson")
    if corr.empty:
        return {"columns": [], "matrix": []}
    return {
        "columns": [str(c) for c in corr.columns],
        "matrix": [[json_safe(v) for v in row] for row in corr.values],
    }


# ------------------------------------------------------------------ cleaning
def _iqr_bounds(series):
    f = pd.to_numeric(series, errors="coerce").dropna()
    if f.empty:
        return None
    q1, q3 = f.quantile(0.25), f.quantile(0.75)
    iqr = q3 - q1
    return q1 - 1.5 * iqr, q3 + 1.5 * iqr, float(q1), float(q3)


def _mostly_numeric(series):
    nn = series.dropna()
    if len(nn) == 0:
        return False
    parsed = pd.to_numeric(nn, errors="coerce")
    return parsed.notna().mean() >= 0.8


def recommendations(df, max_outlier_rows=2000):
    """Build explainable, safe cleaning recommendations. Never destructive by default."""
    recs = []
    n = len(df)

    dups = int(df.duplicated().sum())
    if dups > 0:
        recs.append(_mk("dup_rows", "duplicates", None,
                        {"actionType": "drop_duplicates"},
                        f"{dups} duplicate row(s) found. Removing them prevents a repeated "
                        f"record from biasing averages, counts and visualizations.",
                        dups, "warning"))

    for col in df.columns:
        s = df[col]
        kind = infer_kind(s)
        missing = int(s.isna().sum())

        # incorrect data types (object column that is really numeric)
        if kind == "categorical" and _mostly_numeric(s):
            recs.append(_mk(f"type_{col}", "type", str(col),
                            {"actionType": "convert_numeric", "column": str(col)},
                            f"‘{col}’ is stored as text but {int(pd.to_numeric(s.dropna(), errors='coerce').notna().mean()*100)}% "
                            f"of its values parse as numbers. Converting it enables statistics and charts.",
                            missing, "warning"))

        if missing > 0:
            miss_frac = missing / max(n, 1)
            if miss_frac > 0.6:
                recs.append(_mk(f"miss_{col}", "missing", str(col),
                                {"actionType": "drop_column", "column": str(col)},
                                f"‘{col}’ is {missing} cells empty ({miss_frac:.0%}). A column this incomplete "
                                f"adds little analytical value — removal (with your approval) is usually cleaner than imputation.",
                                missing, "warning"))
            elif kind == "numeric":
                f = _numeric(s)
                skew = float(f.skew()) if len(f) > 2 else 0.0
                bounds = _iqr_bounds(s)
                out_frac = 0.0
                if bounds:
                    lo, hi, _, _ = bounds
                    out_frac = float(((f < lo) | (f > hi)).mean())
                if abs(skew) >= 1.0 or out_frac >= 0.05:
                    method = "median"
                    why = f"‘{col}’ has {missing} missing value(s). Its distribution is skewed (skew={skew:.2f}) or contains influential outliers, so the median is robust — the mean would be pulled toward the extreme values."
                else:
                    method = "mean"
                    why = f"‘{col}’ has {missing} missing value(s) and an approximately symmetric distribution (skew={skew:.2f}), so the mean is a reasonable, low-distortion fill."
                recs.append(_mk(f"miss_{col}", "missing", str(col),
                                {"actionType": "impute", "column": str(col), "method": method},
                                why, missing, "warning" if miss_frac > 0.2 else "info"))
            elif kind == "boolean":
                recs.append(_mk(f"miss_{col}", "missing", str(col),
                                {"actionType": "impute", "column": str(col), "method": "mode"},
                                f"‘{col}’ has {missing} missing value(s). For a boolean column, filling with the most frequent value keeps the data usable without inventing a third category.",
                                missing, "info"))
            else:
                recs.append(_mk(f"miss_{col}", "missing", str(col),
                                {"actionType": "impute", "column": str(col), "method": "mode"},
                                f"‘{col}’ has {missing} missing value(s). It is categorical, so imputing with the most frequent value (mode) preserves valid categories.",
                                missing, "info"))

        # outliers on numeric columns with enough data
        if kind == "numeric":
            bounds = _iqr_bounds(s)
            if bounds:
                lo, hi, q1, q3 = bounds
                f = _numeric(s)
                outliers = f[(f < lo) | (f > hi)]
                n_out = len(outliers)
                if n_out > 0:
                    frac = n_out / max(len(f), 1)
                    if frac <= 0.05:
                        recs.append(_mk(f"out_{col}", "outliers", str(col),
                                        {"actionType": "cap_outliers", "column": str(col),
                                         "lower": round(lo, 4), "upper": round(hi, 4)},
                                        f"{n_out} value(s) in ‘{col}’ fall outside the IQR fences "
                                        f"[{lo:.2f}, {hi:.2f}] (Q1={q1:.2f}, Q3={q3:.2f}). They are only "
                                        f"{frac:.1%} of the data — capping them preserves rows while limiting distortion.",
                                        n_out, "info"))
                    elif frac <= 0.3:
                        recs.append(_mk(f"out_{col}", "outliers", str(col),
                                        {"actionType": "remove_outliers", "column": str(col)},
                                        f"{n_out} value(s) in ‘{col}’ ({frac:.1%}) are outside the IQR fences "
                                        f"[{lo:.2f}, {hi:.2f}]. Capping or removing both work — removal keeps summary "
                                        f"statistics clean, but review these before deleting rows.",
                                        n_out, "warning"))
                    else:
                        recs.append(_mk(f"out_{col}", "outliers", str(col),
                                        {"actionType": "keep_outliers", "column": str(col)},
                                        f"{n_out} value(s) in ‘{col}’ ({frac:.1%}) are beyond the IQR fences. That is a "
                                        f"large share — these may be legitimate values (e.g. heavy-tailed data). "
                                        f"AutoAnalytix recommends keeping them and reviewing manually.",
                                        n_out, "info"))

    return recs


def _mk(id_, issue, column, action, reason, count, severity):
    return {"id": id_, "issue": issue, "column": column, "action": action,
            "reason": reason, "count": count, "severity": severity}


def apply_action(df, action):
    """Apply one cleaning action. Returns (new_df, change_description)."""
    t = action.get("actionType")
    before = len(df)

    if t == "impute":
        col = action["column"]
        method = action.get("method", "median")
        se = df[col]
        n_missing = int(se.isna().sum())
        if method == "mean":
            filler = float(pd.to_numeric(se, errors="coerce").mean())
        elif method == "median":
            filler = float(pd.to_numeric(se, errors="coerce").median())
        else:
            filler = se.mode(dropna=True)
            filler = filler.iloc[0] if len(filler) else None
        df = df.copy()
        if n_missing == 0:
            return df, f"No missing values remaining in ‘{col}’ — nothing to fill."
        df[col] = se.fillna(filler)
        return df, f"Filled {n_missing} missing value(s) in ‘{col}’ with {method} ({json_safe(filler)})."

    if t == "drop_column":
        col = action["column"]
        n_missing = int(df[col].isna().sum())
        df = df.drop(columns=[col])
        return df, f"Dropped column ‘{col}’ ({n_missing} missing value(s)) with your approval."

    if t == "drop_rows_missing":
        cols = action.get("columns") or []
        if cols:
            df = df.dropna(subset=cols)
        else:
            df = df.dropna()
        return df, f"Removed {before - len(df)} row(s) with missing values in {', '.join(cols) if cols else 'any column'}."

    if t == "drop_duplicates":
        df = df.drop_duplicates(keep="first")
        return df.reset_index(drop=True), f"Removed {before - len(df)} duplicate row(s)."

    if t == "convert_numeric":
        col = action["column"]
        converted = pd.to_numeric(df[col], errors="coerce")
        n_fail = int(converted.isna().sum() - df[col].isna().sum())
        df = df.copy()
        df[col] = converted
        return df, (f"Converted ‘{col}’ to numeric dtype"
                    + (f"; {n_fail} unparseable value(s) became missing and can be imputed." if n_fail else "."))

    if t == "cap_outliers":
        col = action["column"]
        lo, hi = float(action["lower"]), float(action["upper"])
        f = pd.to_numeric(df[col], errors="coerce")
        n_capped = int(((f < lo) | (f > hi)).sum())
        df = df.copy()
        df[col] = f.clip(lo, hi)
        return df, f"Capped {n_capped} outlier(s) in ‘{col}’ to the IQR fences [{lo}, {hi}]. No rows were removed."

    if t == "remove_outliers":
        col = action["column"]
        bounds = _iqr_bounds(df[col])
        if not bounds:
            return df, f"No outliers detected in ‘{col}’."
        lo, hi, _, _ = bounds
        f = pd.to_numeric(df[col], errors="coerce")
        mask_in = ~((f < lo) | (f > hi)) | f.isna()
        df = df[mask_in].reset_index(drop=True)
        return df, f"Removed {before - len(df)} row(s) whose ‘{col}’ value was outside the IQR fences [{lo:.2f}, {hi:.2f}], with your approval."

    if t == "keep_outliers":
        return df, f"Kept outliers in ‘{action['column']}’ as recommended."

    raise ValueError(f"Unknown action type: {t}")


# ------------------------------------------------------------------ charts
AGG_LABELS = {"count": "Count", "sum": "Sum", "mean": "Mean", "median": "Median",
              "min": "Min", "max": "Max", "nunique": "Distinct count"}
CHART_TYPES = ["bar", "line", "pie", "donut", "area", "histogram", "scatter", "bubble",
               "box", "violin", "heatmap", "density_heatmap", "strip", "ecdf"]


def filter_df(df, filters):
    """filters: [{col, op, value}]"""
    for f in filters or []:
        col, op, val = f.get("col"), f.get("op"), f.get("value")
        if col not in df.columns or op is None:
            continue
        numeric = infer_kind(df[col]) == "numeric"
        v = pd.to_numeric(val, errors="coerce") if numeric else val
        if op == "eq":
            df = df[df[col] == v]
        elif op == "ne":
            df = df[df[col] != v]
        elif op == "gt":
            df = df[pd.to_numeric(df[col], errors="coerce") > v]
        elif op == "gte":
            df = df[pd.to_numeric(df[col], errors="coerce") >= v]
        elif op == "lt":
            df = df[pd.to_numeric(df[col], errors="coerce") < v]
        elif op == "lte":
            df = df[pd.to_numeric(df[col], errors="coerce") <= v]
        elif op == "contains":
            df = df[df[col].astype(str).str.contains(str(val), case=False, na=False)]
    return df


def _axis_labels(cfg, df, agg):
    agg_l = AGG_LABELS.get(agg, "Count")
    x_lab = cfg.get("x") or ""
    y_lab = f"{agg_l} of {cfg.get('y')}" if (cfg.get("y") and agg != "none") else (cfg.get("y") or "")
    return x_lab, y_lab


def build_figure(df, cfg, title=None):
    """Return a Plotly figure for the given chart configuration."""
    t = cfg.get("type", "bar")
    x, y, group = cfg.get("x"), cfg.get("y"), cfg.get("group")
    agg = cfg.get("agg") or ("none" if (y and infer_kind(df[y]) == "numeric") else "count")
    if isinstance(agg, str):
        agg = agg.lower()
    title = title or f"{t.title()} chart"
    pd.set_option("future.no_silent_downcasting", True)

    def maybe_agg(frame):
        """Aggregate frame by x (optionally grouped) when an aggregation is requested."""
        if agg == "none" or x is None:
            return frame
        if agg == "count":
            keys = [x] if group is None else [x, group]
            agg_df = frame.groupby(keys, dropna=False).size().reset_index(name="Count")
            agg_y = "Count"
        else:
            keys = [x] if group is None else [x, group]
            agg_df = frame.groupby(keys, dropna=False)[y].agg(agg).reset_index(name="agg_value")
            agg_y = "agg_value"
        return agg_df

    # handle a numeric continuous x for categorical-style charts: bin it
    def binned(frame):
        if x and infer_kind(frame[x]) == "numeric" and t in ("bar", "pie", "donut", "area"):
            bins = pd.cut(pd.to_numeric(frame[x], errors="coerce").dropna(), bins=20)
            labels = [f"{iv.left:.5g}–{iv.right:.5g}" for iv in bins.cat.categories]
            cut = pd.cut(pd.to_numeric(frame[x], errors="coerce"), bins=20)
            frame = frame.copy()
            frame[x] = cut.cat.rename_categories(labels).astype(str)
        return frame

    color = group if (group and t in ("bar", "line", "area") and agg != "none") else None

    if agg != "none" or x is None:
        df2 = maybe_agg(df)
        agg_y = "Count" if agg == "count" else "agg_value"
    else:
        df2, agg_y = df, y
    df2 = binned(df2)

    def axis(fig):
        x_lab, y_lab = _axis_labels(cfg, df, agg)
        fig.update_layout(xaxis_title=x_lab or None, yaxis_title=y_lab or None)

    if t == "bar":
        if group and color is not None:
            fig = px.bar(df2, x=x, y=agg_y, color=color, barmode="group")
        else:
            fig = px.bar(df2, x=x, y=agg_y)
        axis(fig)
    elif t == "line":
        fig = px.line(df2.sort_values(x), x=x, y=agg_y, color=group, markers=True)
        axis(fig)
    elif t == "area":
        fig = px.area(df2.sort_values(x), x=x, y=agg_y, color=group)
        axis(fig)
    elif t in ("pie", "donut"):
        fig = px.pie(df2, names=x, values=agg_y, hole=0.55 if t == "donut" else 0)
    elif t == "histogram":
        if y:
            fig = px.histogram(df, x=x, y=y, histfunc="sum" if agg else "count", color=group)
        else:
            fig = px.histogram(df, x=x, color=group, barmode="overlay" if group else "relative")
        axis(fig)
    elif t == "scatter":
        if not (x and y):
            raise ValueError("Scatter plots need both X and Y columns.")
        fig = px.scatter(df, x=x, y=y, color=group, trendline=None)
        axis(fig)
    elif t == "bubble":
        if not (x and y):
            raise ValueError("Bubble charts need both X and Y columns.")
        size = cfg.get("size") or group
        if size in (x, y):
            size = None
        if not size:
            size_col = "bubble_size"
            df = df.copy()
            df[size_col] = 1.0
            size = size_col
        fig = px.scatter(df, x=x, y=y, size=pd.to_numeric(df[size] if size != "bubble_size" else df[size], errors="coerce"),
                         color=group, size_max=42)
        axis(fig)
    elif t == "box":
        if not y:
            raise ValueError("Box plots need a numeric Y column.")
        fig = px.box(df, x=x, y=y, color=group, points="outliers")
        axis(fig)
    elif t == "violin":
        if not y:
            raise ValueError("Violin plots need a numeric Y column.")
        fig = px.violin(df, x=x, y=y, color=group, box=True)
        axis(fig)
    elif t == "strip":
        if not y:
            raise ValueError("Strip plots need a numeric Y column.")
        fig = px.strip(df, x=x, y=y, color=group)
        axis(fig)
    elif t == "ecdf":
        if not y:
            raise ValueError("ECDF plots need a numeric Y column.")
        fig = px.ecdf(df, x=y, color=group)
        fig.update_layout(xaxis_title=str(y), yaxis_title="Cumulative probability")
    elif t == "heatmap":
        if x and y:
            fig = px.density_heatmap(df, x=x, y=y, color_continuous_scale="Blues")
        else:
            corr = correlations(df)
            hm = df.select_dtypes(include=[np.number]).corr()
            fig = go.Figure(go.Heatmap(z=hm.values, x=[str(c) for c in hm.columns],
                                       y=[str(c) for c in hm.columns],
                                       colorscale="Blues", zmin=-1, zmax=1))
            fig.update_layout(xaxis_title=None, yaxis_title=None)
    elif t == "density_heatmap":
        if not (x and y):
            raise ValueError("Density heatmaps need X and Y columns.")
        fig = px.density_heatmap(df, x=x, y=y, color_continuous_scale="Blues")
        axis(fig)
    elif t == "contour":
        if not (x and y):
            raise ValueError("Contour plots need X and Y columns.")
        fig = go.Figure(go.Histogram2dContour(x=pd.to_numeric(df[x], errors="coerce"),
                                              y=pd.to_numeric(df[y], errors="coerce"),
                                              colorscale="Blues"))
        axis(fig)
    else:
        raise ValueError(f"Unsupported chart type: {t}")

    if agg_y == "agg_value":
        fig = _rename_agg_legend(fig, f"{AGG_LABELS.get(agg, agg)} of {y}")
    fig.update_layout(
        title=title,
        margin=dict(l=56, r=28, t=52, b=56),
        font=dict(family="Inter, ui-sans-serif, system-ui", size=12, color="#0f172a"),
        plot_bgcolor="rgba(0,0,0,0)",
        paper_bgcolor="rgba(0,0,0,0)",
        colorway=["#2563eb", "#0ea5e9", "#7c3aed", "#f59e0b", "#10b981", "#ef4444", "#64748b"],
        coloraxis_colorscale="Blues",
    )
    fig.update_xaxes(gridcolor="#e2e8f0", zerolinecolor="#cbd5e1")
    fig.update_yaxes(gridcolor="#e2e8f0", zerolinecolor="#cbd5e1")
    return fig


def _rename_agg_legend(fig, label):
    for trace in fig.data:
        if trace.name is not None:
            trace.name = f"{trace.name} — {label}"
    return fig


def _identifier_cols(df):
    """Columns that look like row identifiers (unique ints named like an id/index)."""
    out = set()
    for c in df.select_dtypes(include=[np.number]).columns:
        s = df[c].dropna()
        if len(s) and s.nunique() == len(s) and pd.api.types.is_integer_dtype(df[c]):
            out.add(c)
    for c in df.columns:
        if str(c).lower().replace("_", "").replace(".", "") in ("id", "index", "unnamed0", "passengerid", "rowid"):
            out.add(c)
    return out


def suggest_charts(df):
    """Data-aware chart suggestions."""
    ids = _identifier_cols(df)
    kinds = {c: infer_kind(df[c]) for c in df.columns if c not in ids}
    numeric = [c for c, k in kinds.items() if k == "numeric"]
    # prefer small-cardinality categoricals (they read best on categorical charts)
    categoricals_all = [
        (df[c].nunique(), c) for c, k in kinds.items() if k == "categorical"
    ]
    categoricals_all.sort()
    small_cats = [c for _, c in categoricals_all]
    big_cats = [c for c in df.columns if c not in ids and c not in small_cats and infer_kind(df[c]) == "categorical"]
    categorical = small_cats + big_cats
    dt_cols = [c for c, k in kinds.items() if k == "datetime"]
    out = []

    def add(t, **kw):
        out.append({"type": t, **kw})

    if categorical and numeric:
        c0, n0 = categorical[0], numeric[0]
        add("bar", x=c0, y=n0, agg="mean", group=None,
            title=f"Mean {n0} by {c0}",
            why="Compare an average across categories — bars make gaps obvious.")
        add("box", x=c0, y=n0, group=None,
            title=f"{n0} spread by {c0}",
            why="Box plots show medians and outliers per category.")
        add("pie", x=c0, y=n0, agg="count", title=f"{c0} breakdown",
            why="Show category shares of the dataset.")
    if len(numeric) >= 2:
        add("scatter", x=numeric[0], y=numeric[1], group=None,
            title=f"{numeric[1]} vs {numeric[0]}",
            why="Two numeric columns — check their relationship.")
        add("histogram", x=numeric[0], y=None, title=f"Distribution of {numeric[0]}",
            why="Histograms reveal the shape, spread and outliers of a numeric column.")
    if len(numeric) >= 3:
        add("bubble", x=numeric[0], y=numeric[1], group=None, size=numeric[2],
            title=f"{numeric[1]} vs {numeric[0]} (size = {numeric[2]})",
            why="Three numeric columns — add a third as bubble size.")
        add("heatmap", x=numeric[0], y=numeric[1],
            title=f"Density of {numeric[0]} vs {numeric[1]}",
            why="See where observations cluster in two dimensions.")
    if dt_cols and numeric:
        add("line", x=dt_cols[0], y=numeric[0], agg="none",
            title=f"{numeric[0]} over {dt_cols[0]}",
            why="A datetime column with a value — trends belong on a line chart.")
    if numeric and not dt_cols:
        n0 = numeric[0]
        add("histogram", x=n0, y=None, title=f"Distribution of {n0}",
            why="Start with a histogram to understand this numeric column.")
    if numeric:
        # choose the most distribution-friendly numeric column (most distinct values)
        best_n = max(numeric, key=lambda c: df[c].nunique())
        if best_n in (None,) or df[best_n].nunique() >= 6:
            out.insert(0, {"type": "histogram", "x": best_n, "title": f"Distribution of {best_n}",
                           "why": "Histograms reveal the shape, spread and outliers of a numeric column."})
    if categorical:
        add("bar", x=categorical[0], y=None, agg="count",
            title=f"Count of records by {categorical[0]}",
            why="The quickest sanity check: how big is each group?")
    # deduplicate identical (type, x, y, agg) suggestions
    seen, uniq = set(), []
    for s in out:
        key = (s["type"], s.get("x"), s.get("y"), s.get("agg"))
        if key in seen:
            continue
        seen.add(key)
        uniq.append(s)
    return uniq[:8]


def regression(df, x, y):
    sub = df[[x, y]].apply(pd.to_numeric, errors="coerce").dropna()
    if len(sub) < 3:
        raise ValueError("Need at least 3 complete (x, y) rows for regression.")
    lr = scipy_stats.linregress(sub[x], sub[y])
    return {
        "x": str(x), "y": str(y), "n": int(len(sub)),
        "slope": lr.slope, "intercept": lr.intercept,
        "r": lr.rvalue, "r2": lr.rvalue ** 2,
        "pValue": lr.pvalue, "stdErr": lr.stderr,
        "equation": f"{y} = {lr.slope:.4g}·{x} + {lr.intercept:.4g}",
    }
