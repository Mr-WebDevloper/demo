const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NAME_RE = /^[a-zA-Z][a-zA-Z0-9._-]{0,79}$/;
const MAX_EVENTS = 25;
const MAX_PROPS = 40;

export function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

export function parseIsoDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function validateEvent(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object") {
    return { ok: false, errors: ["event must be an object"] };
  }
  if (!isUuid(raw.event_id)) errors.push("event_id must be a UUID");
  if (typeof raw.event_name !== "string" || !NAME_RE.test(raw.event_name)) {
    errors.push("event_name must match [a-zA-Z][a-zA-Z0-9._-]{0,79}");
  }
  if (raw.source !== "browser" && raw.source !== "server") {
    errors.push("source must be browser or server");
  }
  const occurred = parseIsoDate(raw.occurred_at);
  if (!occurred) errors.push("occurred_at must be an ISO timestamp");
  else {
    const skew = Math.abs(Date.now() - occurred.getTime());
    if (skew > 7 * 24 * 60 * 60 * 1000) errors.push("occurred_at is outside allowed range");
  }
  if (raw.visitor_id != null && (typeof raw.visitor_id !== "string" || raw.visitor_id.length > 80)) {
    errors.push("visitor_id invalid");
  }
  if (raw.session_id != null && (typeof raw.session_id !== "string" || raw.session_id.length > 80)) {
    errors.push("session_id invalid");
  }
  let properties = raw.properties;
  if (properties == null) properties = {};
  if (typeof properties !== "object" || Array.isArray(properties)) {
    errors.push("properties must be an object");
    properties = {};
  } else if (Object.keys(properties).length > MAX_PROPS) {
    errors.push("too many properties");
  }
  if (raw.page_url != null && (typeof raw.page_url !== "string" || raw.page_url.length > 2000)) {
    errors.push("page_url invalid");
  }
  if (raw.user_agent != null && (typeof raw.user_agent !== "string" || raw.user_agent.length > 500)) {
    errors.push("user_agent invalid");
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    event: {
      event_id: raw.event_id,
      event_name: raw.event_name,
      source: raw.source,
      occurred_at: occurred.toISOString(),
      visitor_id: raw.visitor_id || null,
      session_id: raw.session_id || null,
      properties,
      page_url: raw.page_url || null,
      user_agent: raw.user_agent || null,
    },
  };
}

export function validateBatch(body) {
  if (!body || typeof body !== "object") {
    return { ok: false, status: 400, error: "JSON object required" };
  }
  const events = body.events;
  if (!Array.isArray(events) || events.length === 0) {
    return { ok: false, status: 400, error: "events array is required" };
  }
  if (events.length > MAX_EVENTS) {
    return { ok: false, status: 400, error: `at most ${MAX_EVENTS} events per request` };
  }
  const valid = [];
  const rejected = [];
  events.forEach((item, index) => {
    const result = validateEvent(item);
    if (result.ok) valid.push(result.event);
    else rejected.push({ index, errors: result.errors });
  });
  if (!valid.length) {
    return { ok: false, status: 400, error: "no valid events", rejected };
  }
  return { ok: true, valid, rejected };
}

export { NAME_RE };
