import { query } from "./db.js";

export async function insertEvents(events) {
  if (!events.length) return { accepted: 0, duplicates: 0 };
  const values = [];
  const params = [];
  let i = 1;
  for (const event of events) {
    values.push(
      `($${i++}::uuid, $${i++}, $${i++}, $${i++}::timestamptz, $${i++}, $${i++}, $${i++}::jsonb, $${i++}, $${i++})`
    );
    params.push(
      event.event_id,
      event.event_name,
      event.source,
      event.occurred_at,
      event.visitor_id,
      event.session_id,
      JSON.stringify(event.properties),
      event.page_url,
      event.user_agent
    );
  }
  const sql = `
    INSERT INTO events (
      event_id, event_name, source, occurred_at, visitor_id, session_id, properties, page_url, user_agent
    )
    VALUES ${values.join(",")}
    ON CONFLICT (event_id) DO NOTHING
    RETURNING event_id
  `;
  const result = await query(sql, params);
  const accepted = result.rowCount;
  return { accepted, duplicates: events.length - accepted };
}

function rangeFilter(from, to) {
  return { from: from.toISOString(), to: to.toISOString() };
}

export async function getSummary(from, to) {
  const { from: f, to: t } = rangeFilter(from, to);
  const pageViews = await query(
    `SELECT COUNT(*)::int AS count FROM events
     WHERE event_name = 'page_view' AND occurred_at >= $1 AND occurred_at < $2`,
    [f, t]
  );
  const visitors = await query(
    `SELECT COUNT(DISTINCT visitor_id)::int AS count FROM events
     WHERE visitor_id IS NOT NULL AND occurred_at >= $1 AND occurred_at < $2`,
    [f, t]
  );
  const eventCount = await query(
    `SELECT COUNT(*)::int AS count FROM events WHERE occurred_at >= $1 AND occurred_at < $2`,
    [f, t]
  );
  return {
    pageViews: pageViews.rows[0].count,
    uniqueVisitors: visitors.rows[0].count,
    totalEvents: eventCount.rows[0].count,
    from: f,
    to: t,
  };
}

export async function getPopularPages(from, to, limit = 10) {
  const { from: f, to: t } = rangeFilter(from, to);
  const result = await query(
    `SELECT COALESCE(properties->>'path', page_url, '(unknown)') AS page, COUNT(*)::int AS views
     FROM events
     WHERE event_name = 'page_view' AND occurred_at >= $1 AND occurred_at < $2
     GROUP BY 1
     ORDER BY views DESC
     LIMIT $3`,
    [f, t, limit]
  );
  return result.rows;
}

export async function getEventCounts(from, to) {
  const { from: f, to: t } = rangeFilter(from, to);
  const result = await query(
    `SELECT event_name, source, COUNT(*)::int AS count
     FROM events
     WHERE occurred_at >= $1 AND occurred_at < $2
     GROUP BY event_name, source
     ORDER BY count DESC, event_name`,
    [f, t]
  );
  return result.rows;
}

export async function getTrends(from, to) {
  const { from: f, to: t } = rangeFilter(from, to);
  const span = to.getTime() - from.getTime();
  const trunc = span > 3 * 24 * 60 * 60 * 1000 ? "day" : "hour";
  const result = await query(
    `SELECT date_trunc('${trunc}', occurred_at) AS bucket, event_name, COUNT(*)::int AS count
     FROM events
     WHERE occurred_at >= $1 AND occurred_at < $2
     GROUP BY 1, 2
     ORDER BY 1 ASC, 2`,
    [f, t]
  );
  return { granularity: trunc, points: result.rows };
}

export async function insertOrder(order) {
  await query(
    `INSERT INTO orders (id, items, total_cents, visitor_id, session_id)
     VALUES ($1, $2::jsonb, $3, $4, $5)`,
    [order.id, JSON.stringify(order.items), order.totalCents, order.visitorId, order.sessionId]
  );
}
