const MAX_NAME = 80;
const MAX_PROP_KEYS = 40;
const MAX_STRING = 1000;

function sanitizeProperties(input) {
  if (input == null) return {};
  if (typeof input !== "object" || Array.isArray(input)) return {};
  const out = {};
  for (const key of Object.keys(input).slice(0, MAX_PROP_KEYS)) {
    const value = input[key];
    if (value == null) continue;
    if (typeof value === "string") out[key] = value.slice(0, MAX_STRING);
    else if (typeof value === "number" || typeof value === "boolean") out[key] = value;
    else {
      try {
        out[key] = JSON.stringify(value).slice(0, MAX_STRING);
      } catch {
        // skip
      }
    }
  }
  return out;
}

function uuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Lightweight server-side tracker for business events such as order_created.
 */
export function createServerTracker(config) {
  if (!config?.writeKey || !config?.endpoint) {
    throw new Error("createServerTracker requires writeKey and endpoint");
  }
  const timeoutMs = config.timeoutMs ?? 4000;
  const fetchImpl = config.fetchImpl || fetch;

  async function track(name, properties = {}, context = {}) {
    if (!name || typeof name !== "string") {
      return { ok: false, reason: "invalid_name" };
    }
    const event = {
      event_id: context.eventId || uuid(),
      event_name: name.slice(0, MAX_NAME),
      source: "server",
      occurred_at: context.occurredAt || new Date().toISOString(),
      visitor_id: context.visitorId || null,
      session_id: context.sessionId || null,
      properties: sanitizeProperties(properties),
      page_url: context.pageUrl || null,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${config.endpoint.replace(/\/$/, "")}/v1/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Write-Key": config.writeKey,
        },
        body: JSON.stringify({ events: [event] }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        return { ok: false, reason: "http_error", status: response.status, detail: text.slice(0, 200) };
      }
      const body = await response.json().catch(() => ({}));
      return { ok: true, eventId: event.event_id, body };
    } catch (err) {
      return { ok: false, reason: err.name === "AbortError" ? "timeout" : "network_error", error: err.message };
    } finally {
      clearTimeout(timer);
    }
  }

  return { track };
}
