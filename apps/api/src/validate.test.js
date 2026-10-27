import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateEvent, validateBatch } from "./validate.js";

function good(overrides = {}) {
  return {
    event_id: "11111111-1111-4111-8111-111111111111",
    event_name: "page_view",
    source: "browser",
    occurred_at: new Date().toISOString(),
    visitor_id: "v1",
    session_id: "s1",
    properties: { path: "/menu" },
    ...overrides,
  };
}

describe("validateEvent", () => {
  it("accepts a well-formed event", () => {
    const result = validateEvent(good());
    assert.equal(result.ok, true);
  });

  it("rejects malformed names and ids", () => {
    assert.equal(validateEvent(good({ event_name: "bad name" })).ok, false);
    assert.equal(validateEvent(good({ event_id: "not-a-uuid" })).ok, false);
    assert.equal(validateEvent(good({ source: "mobile" })).ok, false);
  });
});

describe("validateBatch", () => {
  it("keeps valid events and reports rejects", () => {
    const result = validateBatch({
      events: [good(), good({ event_name: "" })],
    });
    assert.equal(result.ok, true);
    assert.equal(result.valid.length, 1);
    assert.equal(result.rejected.length, 1);
  });
});
