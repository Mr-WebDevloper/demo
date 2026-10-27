import { createIdentity, uuid } from "./identity.js";

const MAX_NAME = 80;
const MAX_PROP_KEYS = 25;
const MAX_STRING = 500;
const QUEUE_KEY = "aa_event_queue";
const MAX_QUEUE = 50;

function sanitizeProperties(input) {
  if (input == null) return {};
  if (typeof input !== "object" || Array.isArray(input)) return {};
  const out = {};
  const keys = Object.keys(input).slice(0, MAX_PROP_KEYS);
  for (const key of keys) {
    const value = input[key];
    if (value == null) continue;
    if (typeof value === "string") {
      out[key] = value.slice(0, MAX_STRING);
    } else if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    } else {
      try {
        out[key] = JSON.stringify(value).slice(0, MAX_STRING);
      } catch {
        // skip unserializable
      }
    }
  }
  return out;
}

function readQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(-MAX_QUEUE) : [];
  } catch {
    return [];
  }
}

function writeQueue(items) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-MAX_QUEUE)));
  } catch {
    // ignore
  }
}

function currentPage() {
  if (typeof window === "undefined") return {};
  return {
    url: window.location.href.slice(0, 2000),
    path: window.location.pathname.slice(0, 500),
    title: (document.title || "").slice(0, 300),
    referrer: (document.referrer || "").slice(0, 2000),
  };
}

/**
 * Browser analytics client.
 * Auto page views, custom events, visitor/session IDs, retry queue, graceful failures.
 */
export function initAnalytics(config) {
  if (!config || !config.writeKey || !config.endpoint) {
    throw new Error("initAnalytics requires writeKey and endpoint");
  }

  const identity = createIdentity({ sessionTimeoutMs: config.sessionTimeoutMs });
  const autoPageViews = config.autoPageViews !== false;
  let lastPath = null;
  let flushing = false;

  function enqueue(event) {
    const queue = readQueue();
    queue.push(event);
    writeQueue(queue);
  }

  function payloadFor(name, properties, extra = {}) {
    const page = currentPage();
    return {
      event_id: extra.event_id || uuid(),
      event_name: String(name).slice(0, MAX_NAME),
      source: "browser",
      occurred_at: extra.occurred_at || new Date().toISOString(),
      visitor_id: identity.visitorId(),
      session_id: identity.sessionId(),
      properties: { ...page, ...sanitizeProperties(properties) },
      page_url: page.url,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : undefined,
    };
  }

  async function sendBatch(events) {
    const url = `${config.endpoint.replace(/\/$/, "")}/v1/events`;
    const body = JSON.stringify({ events });
    const headers = {
      "Content-Type": "application/json",
      "X-Write-Key": config.writeKey,
    };

    if (typeof navigator !== "undefined" && navigator.sendBeacon && events.length === 1 && extraBeacon(events)) {
      // sendBeacon used on unload separately
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      keepalive: true,
    });
    if (!response.ok) {
      const err = new Error(`ingest ${response.status}`);
      err.status = response.status;
      throw err;
    }
    return response.json().catch(() => ({}));
  }

  function extraBeacon() {
    return false;
  }

  async function flush() {
    if (flushing) return;
    flushing = true;
    try {
      let queue = readQueue();
      while (queue.length) {
        const batch = queue.slice(0, 20);
        try {
          await sendBatch(batch);
          queue = queue.slice(batch.length);
          writeQueue(queue);
        } catch (err) {
          // 4xx except 429: drop invalid events so a bad payload cannot block the queue
          if (err.status && err.status >= 400 && err.status < 500 && err.status !== 429) {
            queue = queue.slice(batch.length);
            writeQueue(queue);
            continue;
          }
          break;
        }
      }
    } finally {
      flushing = false;
    }
  }

  function track(name, properties) {
    try {
      if (!name || typeof name !== "string") return { ok: false, reason: "invalid_name" };
      enqueue(payloadFor(name, properties));
      flush().catch(() => {});
      return { ok: true };
    } catch {
      return { ok: false, reason: "track_failed" };
    }
  }

  function page(properties) {
    lastPath = typeof window !== "undefined" ? window.location.pathname : lastPath;
    return track("page_view", properties);
  }

  function hookSpaNavigation() {
    if (typeof window === "undefined" || typeof history === "undefined") return;
    const notify = () => {
      const path = window.location.pathname;
      if (path !== lastPath) {
        lastPath = path;
        page({ navigation: "spa" });
      }
    };
    const wrap = (method) => {
      const original = history[method];
      history[method] = function patched() {
        const result = original.apply(this, arguments);
        notify();
        return result;
      };
    };
    wrap("pushState");
    wrap("replaceState");
    window.addEventListener("popstate", notify);
  }

  function hookUnload() {
    if (typeof window === "undefined") return;
    const sendRemaining = () => {
      const queue = readQueue();
      if (!queue.length) return;
      const url = `${config.endpoint.replace(/\/$/, "")}/v1/events`;
      const blob = new Blob([JSON.stringify({ events: queue })], { type: "text/plain" });
      if (navigator.sendBeacon) {
        const sent = navigator.sendBeacon(`${url}?key=${encodeURIComponent(config.writeKey)}`, blob);
        if (sent) writeQueue([]);
      }
    };
    window.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") sendRemaining();
    });
    window.addEventListener("pagehide", sendRemaining);
  }

  if (autoPageViews) {
    page({ navigation: "load" });
    hookSpaNavigation();
  }
  hookUnload();
  flush().catch(() => {});

  return {
    track,
    page,
    flush,
    getVisitorId: () => identity.visitorId(),
    getSessionId: () => identity.sessionId(),
  };
}

export { createIdentity, uuid };
