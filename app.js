const {
  useState,
  useMemo
} = React;

// ---------------------------------------------------------------------------
// Orbital mechanics
// ---------------------------------------------------------------------------
const MU = 398600.4418;
const RE = 6378.137;
const J2 = 1.08262668e-3;
const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const TWOPI = 2 * Math.PI;
const DAY = 86400000;
function norm360(d) {
  return (d % 360 + 360) % 360;
}
function norm2pi(r) {
  return (r % TWOPI + TWOPI) % TWOPI;
}
function gmst(date) {
  const jd = date.getTime() / DAY + 2440587.5;
  const T = (jd - 2451545.0) / 36525.0;
  let g = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T - T * T * T / 38710000.0;
  return norm2pi(norm360(g) * DEG);
}
function kepler(M, e) {
  M = norm2pi(M);
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 60; i++) {
    const f = E - e * Math.sin(E) - M;
    const fp = 1 - e * Math.cos(E);
    const d = f / fp;
    E -= d;
    if (Math.abs(d) < 1e-12) break;
  }
  return E;
}
function trueAnom(E, e) {
  return Math.atan2(Math.sqrt(1 - e * e) * Math.sin(E), Math.cos(E) - e);
}
function makeSat(el) {
  const n0 = el.MEAN_MOTION * TWOPI / 86400;
  const a = Math.cbrt(MU / (n0 * n0));
  const e = el.ECCENTRICITY;
  const i = el.INCLINATION * DEG;
  const p = a * (1 - e * e);
  const factor = 1.5 * J2 * (RE / p) * (RE / p) * n0;
  const raanDot = -factor * Math.cos(i);
  const argpDot = factor * (2 - 2.5 * Math.sin(i) * Math.sin(i));
  const mDot = factor * Math.sqrt(1 - e * e) * (1 - 1.5 * Math.sin(i) * Math.sin(i));
  const epoch = new Date(el.EPOCH + (el.EPOCH.endsWith("Z") ? "" : "Z")).getTime();
  const raan0 = el.RA_OF_ASC_NODE * DEG;
  const argp0 = el.ARG_OF_PERICENTER * DEG;
  const m0 = el.MEAN_ANOMALY * DEG;
  function state(t) {
    const dt = (t - epoch) / 1000;
    const M = m0 + (n0 + mDot) * dt;
    const argp = argp0 + argpDot * dt;
    const raan = raan0 + raanDot * dt;
    const E = kepler(M, e);
    const nu = trueAnom(E, e);
    return {
      u: norm2pi(argp + nu),
      raan,
      i
    };
  }
  function nodeLongitude(t, ascending) {
    const {
      raan
    } = state(t);
    const lonEci = ascending ? raan : raan + Math.PI;
    const lon = lonEci - gmst(new Date(t));
    let d = norm360(lon * RAD);
    if (d > 180) d -= 360;
    return d;
  }
  function findCrossings(tStart, tEnd, ascending) {
    const target = ascending ? 0 : Math.PI;
    const out = [];
    const step = 30000;
    function rel(t) {
      return norm2pi(state(t).u - target);
    }
    let prev = rel(tStart);
    for (let t = tStart + step; t <= tEnd; t += step) {
      const cur = rel(t);
      if (prev > Math.PI && cur < Math.PI && prev - cur > Math.PI / 2) {
        let lo = t - step,
          hi = t;
        for (let k = 0; k < 50; k++) {
          const mid = (lo + hi) / 2;
          if (rel(mid) > Math.PI) lo = mid;else hi = mid;
        }
        out.push((lo + hi) / 2);
      }
      prev = cur;
    }
    return out;
  }
  return {
    findCrossings,
    nodeLongitude,
    i: el.INCLINATION,
    period: TWOPI / (n0 + mDot) / 60
  };
}
function buildReport(el, startMs, days, wantDescending) {
  const sat = makeSat(el);
  const rangeStart = startMs - DAY;
  const rangeEnd = startMs + (days + 1) * DAY;
  const asc = sat.findCrossings(rangeStart, rangeEnd, true);
  const desc = wantDescending ? sat.findCrossings(rangeStart, rangeEnd, false) : [];
  const rows = [];
  for (let d = 0; d < days; d++) {
    const dayStart = startMs + d * DAY;
    const dayEnd = dayStart + DAY;
    const firstAsc = asc.find(t => t >= dayStart && t < dayEnd);
    let firstDesc = null;
    if (wantDescending) {
      const f = desc.find(t => t >= dayStart && t < dayEnd);
      firstDesc = f == null ? null : f;
    }
    rows.push({
      date: new Date(dayStart),
      asc: firstAsc != null ? {
        t: new Date(firstAsc),
        lon: sat.nodeLongitude(firstAsc, true)
      } : null,
      desc: firstDesc != null ? {
        t: new Date(firstDesc),
        lon: sat.nodeLongitude(firstDesc, false)
      } : null
    });
  }
  return {
    rows,
    meta: sat
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
function hhmmss(date) {
  const p = x => String(x).padStart(2, "0");
  return `${p(date.getUTCHours())}:${p(date.getUTCMinutes())}:${p(date.getUTCSeconds())}`;
}
function ymd(date) {
  const p = x => String(x).padStart(2, "0");
  return `${date.getUTCFullYear()}-${p(date.getUTCMonth() + 1)}-${p(date.getUTCDate())}`;
}
function lonStr(d) {
  const v = Math.abs(d).toFixed(1);
  return `${v}\u00B0${d >= 0 ? "E" : "W"}`;
}
const BLANK = {
  AMSAT_NAME: "",
  INCLINATION: "",
  ECCENTRICITY: "",
  RA_OF_ASC_NODE: "",
  ARG_OF_PERICENTER: "",
  MEAN_ANOMALY: "",
  MEAN_MOTION: "",
  EPOCH: ""
};
const FIELDS = [["AMSAT_NAME", "Satellite name", "AO-07"], ["EPOCH", "Epoch (UTC, ISO 8601)", "2026-06-16T23:34:36"], ["INCLINATION", "Inclination (\u00B0)", "101.99"], ["RA_OF_ASC_NODE", "RAAN (\u00B0)", "181.2269"], ["ECCENTRICITY", "Eccentricity", "0.0012576"], ["ARG_OF_PERICENTER", "Arg. of pericenter (\u00B0)", "130.5028"], ["MEAN_ANOMALY", "Mean anomaly (\u00B0)", "286.3286"], ["MEAN_MOTION", "Mean motion (rev/day)", "12.53698125"]];
const BULLETIN_URL = "https://newark192.amsat.org/gpdata/current/daily-bulletin.json";

// Your Cloudflare Worker proxy (see proxy/worker.js + proxy/DEPLOY.md). After
// you deploy, paste its URL here, e.g.:
//   "https://oscarlocator-pwa.prstoetzer.workers.dev/"
// Leave as "" to fall back to the public proxy below.
const PROXY_URL = "";

// Public CORS proxy used only if PROXY_URL is empty or fails. Third-party,
// best-effort — fine as a fallback, not something to rely on.
const PUBLIC_PROXY = "https://api.allorigins.win/raw?url=";
function bulletinSources() {
  const list = [];
  if (PROXY_URL) list.push({
    label: "your proxy",
    url: PROXY_URL.replace(/\/$/, "")
  });
  list.push({
    label: "public proxy",
    url: PUBLIC_PROXY + encodeURIComponent(BULLETIN_URL)
  });
  list.push({
    label: "direct",
    url: BULLETIN_URL
  });
  return list;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
function App() {
  const [el, setEl] = useState({
    ...BLANK
  });
  const [days, setDays] = useState(60);
  const [wantDesc, setWantDesc] = useState(false);
  const [startDate, setStartDate] = useState(() => {
    const n = new Date();
    return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, "0")}-${String(n.getUTCDate()).padStart(2, "0")}`;
  });
  const [report, setReport] = useState(null);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [raw, setRaw] = useState("");
  const [catalog, setCatalog] = useState([]);
  const [fetching, setFetching] = useState(false);
  function set(k, v) {
    setEl(p => ({
      ...p,
      [k]: v
    }));
  }
  function applyRecord(obj) {
    const next = {
      ...BLANK
    };
    for (const [k] of FIELDS) if (obj[k] != null) next[k] = String(obj[k]);
    setEl(next);
  }
  function loadPasted() {
    setErr("");
    setNote("");
    try {
      let obj = JSON.parse(raw.trim());
      if (Array.isArray(obj)) obj = obj[0];
      applyRecord(obj);
    } catch (e) {
      setErr("Could not parse JSON. Paste one GP element object (or an array).");
    }
  }
  async function fetchLive() {
    setErr("");
    setNote("");
    setFetching(true);
    const sources = bulletinSources();
    let lastErr = "";
    for (const src of sources) {
      try {
        const res = await fetch(src.url, {
          headers: {
            "Accept": "application/json"
          }
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        if (!Array.isArray(data) || !data.length) throw new Error("empty/invalid payload");
        setCatalog(data);
        applyRecord(data[0]);
        setNote(`Loaded ${data.length} satellites via ${src.label}.`);
        setFetching(false);
        return;
      } catch (e) {
        lastErr = e.message;
        // try next source
      }
    }
    setFetching(false);
    setErr("Could not fetch live elements (" + lastErr + "). Deploy your Worker proxy and set PROXY_URL, or use the paste box below.");
  }
  function generate() {
    setErr("");
    setNote("");
    for (const [k, label] of FIELDS) {
      if (el[k] === "" || el[k] == null) {
        setErr("Missing: " + label);
        return;
      }
    }
    const rec = {
      AMSAT_NAME: el.AMSAT_NAME,
      INCLINATION: parseFloat(el.INCLINATION),
      ECCENTRICITY: parseFloat(el.ECCENTRICITY),
      RA_OF_ASC_NODE: parseFloat(el.RA_OF_ASC_NODE),
      ARG_OF_PERICENTER: parseFloat(el.ARG_OF_PERICENTER),
      MEAN_ANOMALY: parseFloat(el.MEAN_ANOMALY),
      MEAN_MOTION: parseFloat(el.MEAN_MOTION),
      EPOCH: el.EPOCH.trim()
    };
    const [Y, M, D] = startDate.split("-").map(Number);
    const startMs = Date.UTC(Y, M - 1, D, 0, 0, 0);
    try {
      const r = buildReport(rec, startMs, days, wantDesc);
      setReport({
        ...r,
        name: rec.AMSAT_NAME,
        wantDesc
      });
    } catch (e) {
      setErr("Calculation failed: " + e.message);
    }
  }
  const textReport = useMemo(() => {
    if (!report) return "";
    const L = [];
    L.push(`OSCARLOCATOR REFERENCE ORBITS  -  ${report.name}`);
    L.push(`First equatorial crossing per UTC day  -  ${report.rows.length} days`);
    L.push(`Period ${report.meta.period.toFixed(2)} min   Incl ${report.meta.i}\u00B0`);
    L.push("");
    const head = report.wantDesc ? "DATE        ASC UTC   ASC LON     DSC UTC   DSC LON" : "DATE        ASC UTC   ASC LON";
    L.push(head);
    L.push("-".repeat(head.length));
    for (const r of report.rows) {
      let line = `${ymd(r.date)}  `;
      line += r.asc ? `${hhmmss(r.asc.t)}  ${lonStr(r.asc.lon).padStart(8)}` : `   --        --   `;
      if (report.wantDesc) {
        line += "   ";
        line += r.desc ? `${hhmmss(r.desc.t)}  ${lonStr(r.desc.lon).padStart(8)}` : `   --        --   `;
      }
      L.push(line);
    }
    return L.join("\n");
  }, [report]);
  function download() {
    const blob = new Blob([textReport], {
      type: "text/plain"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `oscarlocator_${(report ? report.name : "sat").replace(/\W+/g, "_")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "ol-root"
  }, /*#__PURE__*/React.createElement("header", {
    className: "ol-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ol-grid-bg",
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement("div", {
    className: "ol-eyebrow"
  }, "AMSAT GP ELEMENTS · ASCENDING-NODE REFERENCE"), /*#__PURE__*/React.createElement("h1", null, "OSCARLOCATOR", /*#__PURE__*/React.createElement("span", {
    className: "ol-blink"
  }, "_")), /*#__PURE__*/React.createElement("p", {
    className: "ol-sub"
  }, "Key in a satellite's orbital elements and generate the time & longitude of the first equatorial node crossing for each UTC day — the reference orbits you plot on the locator board.")), /*#__PURE__*/React.createElement("main", {
    className: "ol-main"
  }, /*#__PURE__*/React.createElement("section", {
    className: "ol-panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ol-panel-title"
  }, "01 — Elements"), /*#__PURE__*/React.createElement("div", {
    className: "ol-fetchrow"
  }, /*#__PURE__*/React.createElement("button", {
    className: "ol-btn sm",
    onClick: fetchLive,
    disabled: fetching
  }, fetching ? "Fetching…" : "Fetch AMSAT live"), catalog.length > 0 && /*#__PURE__*/React.createElement("select", {
    className: "ol-select",
    onChange: e => {
      const idx = +e.target.value;
      if (!isNaN(idx)) applyRecord(catalog[idx]);
    }
  }, /*#__PURE__*/React.createElement("option", null, "Select satellite…"), catalog.map((s, idx) => /*#__PURE__*/React.createElement("option", {
    key: idx,
    value: idx
  }, s.AMSAT_NAME || s.OBJECT_NAME)))), note && /*#__PURE__*/React.createElement("div", {
    className: "ol-note"
  }, note), /*#__PURE__*/React.createElement("details", {
    className: "ol-paste"
  }, /*#__PURE__*/React.createElement("summary", null, "Or paste from daily-bulletin.json"), /*#__PURE__*/React.createElement("p", {
    className: "ol-hint"
  }, "Copy one satellite object (or the whole array — the first entry is used) from ", /*#__PURE__*/React.createElement("code", null, "newark192.amsat.org/gpdata/current/daily-bulletin.json"), "."), /*#__PURE__*/React.createElement("textarea", {
    className: "ol-raw",
    placeholder: '{ "AMSAT_NAME": "AO-07", "INCLINATION": 101.99, ... }',
    value: raw,
    onChange: e => setRaw(e.target.value)
  }), /*#__PURE__*/React.createElement("button", {
    className: "ol-btn ghost",
    onClick: loadPasted
  }, "Fill fields")), /*#__PURE__*/React.createElement("div", {
    className: "ol-fields"
  }, FIELDS.map(([k, label, ph]) => /*#__PURE__*/React.createElement("label", {
    key: k,
    className: "ol-field"
  }, /*#__PURE__*/React.createElement("span", null, label), /*#__PURE__*/React.createElement("input", {
    value: el[k],
    placeholder: ph,
    spellCheck: false,
    onChange: e => set(k, e.target.value)
  })))), /*#__PURE__*/React.createElement("div", {
    className: "ol-panel-title"
  }, "02 — Report"), /*#__PURE__*/React.createElement("div", {
    className: "ol-opts"
  }, /*#__PURE__*/React.createElement("label", {
    className: "ol-field"
  }, /*#__PURE__*/React.createElement("span", null, "Start date (UTC)"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: startDate,
    onChange: e => setStartDate(e.target.value)
  })), /*#__PURE__*/React.createElement("label", {
    className: "ol-field"
  }, /*#__PURE__*/React.createElement("span", null, "Days"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    min: "1",
    max: "120",
    value: days,
    onChange: e => setDays(Math.max(1, Math.min(120, +e.target.value || 1)))
  })), /*#__PURE__*/React.createElement("label", {
    className: "ol-check"
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: wantDesc,
    onChange: e => setWantDesc(e.target.checked)
  }), /*#__PURE__*/React.createElement("span", null, "Include descending node"))), err && /*#__PURE__*/React.createElement("div", {
    className: "ol-err"
  }, err), /*#__PURE__*/React.createElement("button", {
    className: "ol-btn",
    onClick: generate
  }, "Generate reference orbits")), /*#__PURE__*/React.createElement("section", {
    className: "ol-out"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ol-out-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ol-panel-title"
  }, "Output"), report && /*#__PURE__*/React.createElement("div", {
    className: "ol-out-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "ol-btn ghost",
    onClick: () => navigator.clipboard && navigator.clipboard.writeText(textReport)
  }, "Copy"), /*#__PURE__*/React.createElement("button", {
    className: "ol-btn ghost",
    onClick: download
  }, "Download .txt"))), !report && /*#__PURE__*/React.createElement("div", {
    className: "ol-empty"
  }, "Enter elements and generate to see the reference-orbit table. Each row is the first ascending-node equatorial crossing of that UTC day."), report && /*#__PURE__*/React.createElement("div", {
    className: "ol-tablewrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "ol-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "UTC Date"), /*#__PURE__*/React.createElement("th", null, "Asc. UTC"), /*#__PURE__*/React.createElement("th", null, "Asc. Long."), report.wantDesc && /*#__PURE__*/React.createElement("th", null, "Desc. UTC"), report.wantDesc && /*#__PURE__*/React.createElement("th", null, "Desc. Long."))), /*#__PURE__*/React.createElement("tbody", null, report.rows.map((r, idx) => /*#__PURE__*/React.createElement("tr", {
    key: idx
  }, /*#__PURE__*/React.createElement("td", {
    className: "mono"
  }, ymd(r.date)), /*#__PURE__*/React.createElement("td", {
    className: "mono"
  }, r.asc ? hhmmss(r.asc.t) : "—"), /*#__PURE__*/React.createElement("td", {
    className: "mono accent"
  }, r.asc ? lonStr(r.asc.lon) : "—"), report.wantDesc && /*#__PURE__*/React.createElement("td", {
    className: "mono"
  }, r.desc ? hhmmss(r.desc.t) : "—"), report.wantDesc && /*#__PURE__*/React.createElement("td", {
    className: "mono accent2"
  }, r.desc ? lonStr(r.desc.lon) : "—")))))))), /*#__PURE__*/React.createElement("footer", {
    className: "ol-foot"
  }, "Longitudes are sub-satellite equator crossings, east positive. Propagation uses mean elements with J2 secular nodal regression — fine for OSCARLOCATOR plotting, not for precise pointing. 73."));
}
ReactDOM.createRoot(document.getElementById("root")).render(/*#__PURE__*/React.createElement(App, null));
