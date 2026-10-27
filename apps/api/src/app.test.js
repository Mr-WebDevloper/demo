import { describe, it } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "./app.js";

describe("ingest API (no database)", () => {
  const app = createApp();

  it("rejects missing write key", async () => {
    const res = await request(app).post("/v1/events").send({ events: [] });
    assert.equal(res.status, 401);
  });

  it("rejects malformed batches", async () => {
    const res = await request(app)
      .post("/v1/events")
      .set("X-Write-Key", process.env.WRITE_KEY || "dev-write-key-change-me")
      .send({ events: [{ event_name: "x" }] });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it("rejects dashboard queries without key", async () => {
    const res = await request(app).get("/v1/analytics/summary");
    assert.equal(res.status, 401);
  });

  it("rejects invalid order payloads", async () => {
    const res = await request(app).post("/api/orders").send({ items: [{ id: "nope", qty: 1 }] });
    assert.equal(res.status, 400);
  });

  it("serves the restaurant menu", async () => {
    const res = await request(app).get("/api/menu");
    assert.equal(res.status, 200);
    assert.ok(res.body.items.length >= 1);
  });
});
