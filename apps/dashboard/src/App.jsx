import { useCallback, useEffect, useMemo, useState } from "react";

const api = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
const dashboardKey = import.meta.env.VITE_DASHBOARD_KEY || "dev-dashboard-key-change-me";

function isoLocal(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultRange() {
  const to = new Date();
  const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { from: isoLocal(from), to: isoLocal(to) };
}

async function load(path, from, to) {
  const url = `${api}${path}?from=${encodeURIComponent(new Date(from).toISOString())}&to=${encodeURIComponent(new Date(to).toISOString())}`;
  const res = await fetch(url, { headers: { "X-Dashboard-Key": dashboardKey } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

function fmtBucket(iso, granularity) {
  const d = new Date(iso);
  if (granularity === "hour") {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function App() {
  const initial = useMemo(defaultRange, []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [summary, setSummary] = useState(null);
  const [pages, setPages] = useState([]);
  const [counts, setCounts] = useState([]);
  const [trends, setTrends] = useState({ points: [], granularity: "hour" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [s, p, e, t] = await Promise.all([
        load("/v1/analytics/summary", from, to),
        load("/v1/analytics/pages", from, to),
        load("/v1/analytics/events", from, to),
        load("/v1/analytics/trends", from, to),
      ]);
      setSummary(s);
      setPages(p.pages || []);
      setCounts(e.counts || []);
      setTrends(t);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { refresh(); }, [refresh]);

  const totalsByBucket = useMemo(() => {
    const map = new Map();
    for (const point of trends.points || []) {
      const key = new Date(point.bucket).toISOString();
      map.set(key, (map.get(key) || 0) + point.count);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [trends]);
  const maxBar = Math.max(1, ...totalsByBucket.map(([, n]) => n));

  return (
    <>
      <div className="topbar">
        <span className="topbar-brand">Harbor <span>Analytics</span></span>
        <span className="topbar-tag">Live</span>
      </div>

      <main>
        <h1 className="page-title">Analytics Overview</h1>
        <p className="page-sub">Page views, visitors, events and trends for the restaurant demo.</p>

        <div className="filters">
          <label>
            From
            <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            To
            <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button onClick={refresh} disabled={loading}>
            {loading ? "Loading..." : "Apply"}
          </button>
        </div>

        {error && <div className="error">{error}</div>}

        <div className="kpis">
          <div className="kpi-card">
            <div className="kpi-label">Page Views</div>
            <div className="kpi-value">{summary?.pageViews ?? "—"}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Unique Visitors</div>
            <div className="kpi-value">{summary?.uniqueVisitors ?? "—"}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Total Events</div>
            <div className="kpi-value">{summary?.totalEvents ?? "—"}</div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Event Trend</h2>
            <span className="card-tag">{trends.granularity}</span>
          </div>
          <div className="bars-wrap">
            <div className="bars">
              {totalsByBucket.length > 0
                ? totalsByBucket.map(([bucket, count]) => (
                    <div
                      key={bucket}
                      className="bar-col"
                      title={`${fmtBucket(bucket, trends.granularity)}: ${count}`}
                    >
                      <div className="bar" style={{ height: `${(count / maxBar) * 120}px` }} />
                      <div className="bar-tick">{fmtBucket(bucket, trends.granularity)}</div>
                    </div>
                  ))
                : <div className="no-data">No events in this range.</div>
              }
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Popular Pages</h2>
            <span className="card-tag">{pages.length} pages</span>
          </div>
          <table>
            <thead>
              <tr><th>Page</th><th>Views</th></tr>
            </thead>
            <tbody>
              {pages.map((row) => (
                <tr key={row.page}>
                  <td>{row.page}</td>
                  <td className="count-pill">{row.views}</td>
                </tr>
              ))}
              {!pages.length && (
                <tr><td colSpan={2} style={{ textAlign: "center", padding: "24px 0", color: "var(--muted)" }}>No data</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Event Counts</h2>
            <span className="card-tag">{counts.length} event types</span>
          </div>
          <table>
            <thead>
              <tr><th>Event</th><th>Source</th><th>Count</th></tr>
            </thead>
            <tbody>
              {counts.map((row) => (
                <tr key={`${row.event_name}-${row.source}`}>
                  <td>{row.event_name}</td>
                  <td>
                    <span className={`tag-source tag-${row.source}`}>{row.source}</span>
                  </td>
                  <td className="count-pill">{row.count}</td>
                </tr>
              ))}
              {!counts.length && (
                <tr><td colSpan={3} style={{ textAlign: "center", padding: "24px 0", color: "var(--muted)" }}>No data</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
