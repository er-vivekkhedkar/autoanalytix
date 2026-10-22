async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, options);
  } catch {
    throw new Error("Cannot reach the AutoAnalytix server. Is the backend running on port 8000?");
  }
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.clone().json();
      detail = body.detail || detail;
      if (Array.isArray(detail)) detail = detail.map((d) => d.msg || JSON.stringify(d)).join("; ");
    } catch { /* non-json */ }
    const err = new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
    err.status = res.status;
    throw err;
  }
  return res;
}

const jsonBody = (data) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});

export const api = {
  health: () => request("/health"),
  upload: (file) => {
    const fd = new FormData();
    fd.append("file", file);
    return request("/upload", { method: "POST", body: fd }).then((r) => r.json());
  },
  listSamples: () => request("/samples").then((r) => r.json()),
  loadSample: (id) => request(`/sample/${id}`, { method: "POST" }).then((r) => r.json()),
  dataset: (id) => request(`/dataset/${id}`).then((r) => r.json()),
  profile: (id) => request(`/profile/${id}`).then((r) => r.json()),
  cleaning: (id) => request(`/cleaning/${id}`).then((r) => r.json()),
  apply: (id, actions) => request(`/cleaning/apply/${id}`, jsonBody({ actions })).then((r) => r.json()),
  undo: (id) => request(`/cleaning/undo/${id}`, { method: "POST" }).then((r) => r.json()),
  stats: (id) => request(`/stats/${id}`).then((r) => r.json()),
  regression: (id, x, y) => request("/stats/regression", jsonBody({ datasetId: id, x, y })).then((r) => r.json()),
  suggestions: (id) => request(`/chart/suggest/${id}`).then((r) => r.json()),
  chart: (cfg) => request("/chart", jsonBody(cfg)).then((r) => r.json()),
  data: (id, { limit = 50, offset = 0, variant = "current" } = {}) =>
    request(`/data/${id}?limit=${limit}&offset=${offset}&original=${variant}`).then((r) => r.json()),
  downloadFile: async (path, fallbackName) => {
    const res = await request(path);
    const cd = res.headers.get("content-disposition") || "";
    const m = /filename="?([^";]+)"?/.exec(cd);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = m ? m[1] : fallbackName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  exportCsv: (id) => api.downloadFile(`/export/${id}/csv`, "cleaned.csv"),
  exportJson: (id) => api.downloadFile(`/export/${id}/json`, "cleaned.json"),
  exportReport: (id, charts) =>
    request("/export/report", jsonBody({ datasetId: id, charts })).then(async (res) => {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "AutoAnalytix_report.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }),
  exportZip: (id, charts) =>
    request("/export/zip", jsonBody({ datasetId: id, charts })).then(async (res) => {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "AutoAnalytix_package.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }),
};
