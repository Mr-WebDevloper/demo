import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { initDb, closeDb, query } from "./db.js";
import { insertEvents, getSummary } from "./store.js";

describe("event store", async () => {
  before(async () => {
    await initDb();
  });
  after(async () => {
    await closeDb();
  });

  it("inserts events, ignores duplicates, and counts page views", async () => {
    const eventId = "22222222-2222-4222-8222-222222222222";
    const payload = {
      event_id: eventId,
      event_name: "page_view",
      source: "browser",
      occurred_at: new Date().toISOString(),
      visitor_id: "visitor-int",
      session_id: "session-int",
      properties: { path: "/menu" },
      page_url: "http://localhost/menu",
      user_agent: "test",
    };
    const first = await insertEvents([payload]);
    const second = await insertEvents([payload]);
    assert.equal(first.accepted, 1);
    assert.equal(second.duplicates, 1);
    const from = new Date(Date.now() - 60_000);
    const to = new Date(Date.now() + 60_000);
    const summary = await getSummary(from, to);
    assert.ok(summary.pageViews >= 1);
    assert.ok(summary.uniqueVisitors >= 1);
    await query("DELETE FROM events WHERE event_id = $1", [eventId]);
  });
});
