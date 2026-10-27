import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createIdentity } from "./identity.js";

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

describe("identity", () => {
  it("reuses visitor id and rotates session after timeout", () => {
    globalThis.localStorage = new MemoryStorage();
    globalThis.sessionStorage = new MemoryStorage();
    const id = createIdentity({ sessionTimeoutMs: 10 });
    const v1 = id.visitorId();
    const s1 = id.sessionId();
    assert.equal(id.visitorId(), v1);
    assert.equal(id.sessionId(), s1);
    const oldTs = Date.now() - 1000;
    sessionStorage.setItem("aa_session_ts", String(oldTs));
    const s2 = id.sessionId();
    assert.notEqual(s2, s1);
    assert.equal(id.visitorId(), v1);
  });
});
