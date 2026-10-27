import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { initAnalytics } from "./index.js";

class MemoryStorage {
  constructor() {
    this.map = new Map();
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.map.set(key, String(value));
  }
}

describe("browser sdk", () => {
  beforeEach(() => {
    globalThis.localStorage = new MemoryStorage();
    globalThis.sessionStorage = new MemoryStorage();
    globalThis.window = {
      location: { href: "http://localhost/menu", pathname: "/menu" },
      addEventListener() {},
    };
    globalThis.document = { title: "Menu", referrer: "", visibilityState: "visible" };
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { userAgent: "test", sendBeacon: () => true },
    });
    globalThis.history = { pushState() {}, replaceState() {} };
  });

  it("queues events and posts them to ingest", async () => {
    const calls = [];
    globalThis.fetch = async (url, opts) => {
      calls.push({ url, opts });
      return { ok: true, json: async () => ({ accepted: 1 }) };
    };
    const client = initAnalytics({
      writeKey: "wk",
      endpoint: "http://localhost:4000",
      autoPageViews: false,
    });
    const result = client.track("menu_viewed", { category: "mains" });
    assert.equal(result.ok, true);
    await client.flush();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "http://localhost:4000/v1/events");
    assert.equal(calls[0].opts.headers["X-Write-Key"], "wk");
    const body = JSON.parse(calls[0].opts.body);
    assert.equal(body.events[0].event_name, "menu_viewed");
    assert.equal(body.events[0].source, "browser");
    assert.equal(body.events[0].properties.category, "mains");
    assert.ok(body.events[0].visitor_id);
    assert.ok(body.events[0].session_id);
  });

  it("does not throw when tracking with a bad name", () => {
    const client = initAnalytics({
      writeKey: "wk",
      endpoint: "http://localhost:4000",
      autoPageViews: false,
    });
    assert.equal(client.track("", {}).ok, false);
  });
});
