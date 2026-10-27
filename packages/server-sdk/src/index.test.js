import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServerTracker } from "./index.js";

describe("server tracker", () => {
  it("posts order_created with write key", async () => {
    let captured;
    const tracker = createServerTracker({
      writeKey: "secret",
      endpoint: "http://api.test",
      fetchImpl: async (url, opts) => {
        captured = { url, opts };
        return { ok: true, json: async () => ({ accepted: 1, duplicates: 0 }) };
      },
    });
    const result = await tracker.track("order_created", { orderId: "o-1", total: 24.5 }, { visitorId: "v1" });
    assert.equal(result.ok, true);
    assert.equal(captured.url, "http://api.test/v1/events");
    assert.equal(captured.opts.headers["X-Write-Key"], "secret");
    const body = JSON.parse(captured.opts.body);
    assert.equal(body.events[0].event_name, "order_created");
    assert.equal(body.events[0].source, "server");
    assert.equal(body.events[0].visitor_id, "v1");
    assert.equal(body.events[0].properties.total, 24.5);
  });

  it("returns a failure object instead of throwing on network errors", async () => {
    const tracker = createServerTracker({
      writeKey: "secret",
      endpoint: "http://api.test",
      fetchImpl: async () => {
        throw new Error("ECONNREFUSED");
      },
    });
    const result = await tracker.track("order_created", { orderId: "o-2" });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "network_error");
  });
});
