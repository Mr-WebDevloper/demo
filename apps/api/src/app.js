import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { validateBatch } from "./validate.js";
import {
  insertEvents,
  getSummary,
  getPopularPages,
  getEventCounts,
  getTrends,
  insertOrder,
} from "./store.js";
import { createServerTracker } from "@app-analytics/server-sdk";

const MENU = [
  // Starters
  { id: "bruschetta",   name: "Bruschetta al Pomodoro", priceCents: 950,  description: "Grilled sourdough, heirloom tomato, garlic, fresh basil", category: "Starters" },
  { id: "burrata",      name: "Burrata & Prosciutto",   priceCents: 1350, description: "Creamy burrata, aged prosciutto, fig jam, rocket",          category: "Starters" },
  { id: "soup",         name: "Roasted Tomato Soup",    priceCents: 850,  description: "Slow-roasted vine tomatoes, basil oil, sourdough croutons", category: "Starters" },
  // Mains
  { id: "margherita",   name: "Margherita Pizza",       priceCents: 1400, description: "San Marzano tomato, fior di latte, fresh basil, EVOO",      category: "Mains" },
  { id: "carbonara",    name: "Spaghetti Carbonara",    priceCents: 1600, description: "Egg yolk, aged pecorino, guanciale, black pepper",          category: "Mains" },
  { id: "risotto",      name: "Mushroom Risotto",       priceCents: 1750, description: "Porcini, arborio, parmesan, truffle oil, chives",           category: "Mains" },
  { id: "salmon",       name: "Pan-Seared Salmon",      priceCents: 2200, description: "Atlantic salmon, lemon caper butter, charred asparagus",    category: "Mains" },
  { id: "steak",        name: "Grilled Ribeye Steak",   priceCents: 3200, description: "250g ribeye, rosemary jus, roasted garlic, fries",          category: "Mains" },
  // Salads
  { id: "salad",        name: "House Garden Salad",     priceCents: 900,  description: "Mixed greens, radish, cucumber, lemon vinaigrette",         category: "Salads" },
  { id: "caesar",       name: "Caesar Salad",           priceCents: 1100, description: "Cos lettuce, parmesan crisp, anchovy dressing, croutons",   category: "Salads" },
  // Desserts
  { id: "tiramisu",     name: "Tiramisu",               priceCents: 800,  description: "Espresso-soaked savoiardi, mascarpone cream, cocoa",        category: "Desserts" },
  { id: "pannacotta",   name: "Vanilla Panna Cotta",    priceCents: 750,  description: "Silky vanilla cream, wild berry compote, mint",             category: "Desserts" },
  { id: "lava",         name: "Chocolate Lava Cake",    priceCents: 900,  description: "Warm dark chocolate, molten centre, vanilla gelato",        category: "Desserts" },
];

function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) {
    crypto.timingSafeEqual(left, Buffer.alloc(left.length));
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function requireWriteKey(req, res, next) {
  const header = req.get("x-write-key");
  const queryKey = typeof req.query.key === "string" ? req.query.key : "";
  const provided = header || queryKey;
  if (!provided || !timingSafeEqual(provided, config.writeKey)) {
    return res.status(401).json({ error: "invalid write key" });
  }
  next();
}

function requireDashboardKey(req, res, next) {
  const provided = req.get("x-dashboard-key");
  if (!provided || !timingSafeEqual(provided, config.dashboardKey)) {
    return res.status(401).json({ error: "invalid dashboard key" });
  }
  next();
}

const hits = new Map();
function rateLimit(windowMs, max) {
  return (req, res, next) => {
    const ip = req.ip || "local";
    const now = Date.now();
    const bucket = hits.get(ip) || [];
    const fresh = bucket.filter((t) => now - t < windowMs);
    if (fresh.length >= max) {
      return res.status(429).json({ error: "rate limited" });
    }
    fresh.push(now);
    hits.set(ip, fresh);
    next();
  };
}

function parseRange(query) {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from ? new Date(query.from) : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
    return { error: "from and to must be valid ISO dates with from < to" };
  }
  const maxSpan = 90 * 24 * 60 * 60 * 1000;
  if (to.getTime() - from.getTime() > maxSpan) {
    return { error: "range cannot exceed 90 days" };
  }
  return { from, to };
}

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(cors({ origin: config.corsOrigins, methods: ["GET", "POST", "OPTIONS"] }));
  app.use(express.json({ limit: "32kb" }));
  app.use(express.text({ limit: "32kb", type: "text/plain" }));
  app.use((req, _res, next) => {
    if (typeof req.body === "string" && req.body.length) {
      try {
        req.body = JSON.parse(req.body);
      } catch {
        req.body = { __parseError: true };
      }
    }
    next();
  });

  const tracker = createServerTracker({
    writeKey: config.writeKey,
    endpoint: `http://127.0.0.1:${config.port}`,
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/v1/events", rateLimit(60_000, 120), requireWriteKey, async (req, res) => {
    if (req.body?.__parseError) {
      return res.status(400).json({ error: "malformed JSON" });
    }
    const parsed = validateBatch(req.body);
    if (!parsed.ok) {
      return res.status(parsed.status).json({ error: parsed.error, rejected: parsed.rejected });
    }
    try {
      const result = await insertEvents(parsed.valid);
      res.status(202).json({
        accepted: result.accepted,
        duplicates: result.duplicates,
        rejected: parsed.rejected,
      });
    } catch (err) {
      console.error("insertEvents", err);
      res.status(500).json({ error: "failed to persist events" });
    }
  });

  app.get("/v1/analytics/summary", requireDashboardKey, async (req, res) => {
    const range = parseRange(req.query);
    if (range.error) return res.status(400).json({ error: range.error });
    try {
      res.json(await getSummary(range.from, range.to));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "query failed" });
    }
  });

  app.get("/v1/analytics/pages", requireDashboardKey, async (req, res) => {
    const range = parseRange(req.query);
    if (range.error) return res.status(400).json({ error: range.error });
    try {
      res.json({ pages: await getPopularPages(range.from, range.to) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "query failed" });
    }
  });

  app.get("/v1/analytics/events", requireDashboardKey, async (req, res) => {
    const range = parseRange(req.query);
    if (range.error) return res.status(400).json({ error: range.error });
    try {
      res.json({ counts: await getEventCounts(range.from, range.to) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "query failed" });
    }
  });

  app.get("/v1/analytics/trends", requireDashboardKey, async (req, res) => {
    const range = parseRange(req.query);
    if (range.error) return res.status(400).json({ error: range.error });
    try {
      res.json(await getTrends(range.from, range.to));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "query failed" });
    }
  });

  app.get("/api/menu", (_req, res) => {
    res.json({ items: MENU });
  });

  app.post("/api/orders", rateLimit(60_000, 30), async (req, res) => {
    const items = req.body?.items;
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: "items array required" });
    }
    const resolved = [];
    for (const line of items) {
      const dish = MENU.find((m) => m.id === line.id);
      const qty = Number(line.qty);
      if (!dish || !Number.isInteger(qty) || qty < 1 || qty > 20) {
        return res.status(400).json({ error: "invalid item or quantity" });
      }
      resolved.push({ id: dish.id, name: dish.name, qty, priceCents: dish.priceCents });
    }
    const totalCents = resolved.reduce((sum, line) => sum + line.priceCents * line.qty, 0);
    const order = {
      id: crypto.randomUUID(),
      items: resolved,
      totalCents,
      visitorId: typeof req.body.visitorId === "string" ? req.body.visitorId.slice(0, 80) : null,
      sessionId: typeof req.body.sessionId === "string" ? req.body.sessionId.slice(0, 80) : null,
    };
    try {
      await insertOrder(order);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "could not save order" });
    }

    const tracked = await tracker.track(
      "order_created",
      {
        orderId: order.id,
        totalCents: order.totalCents,
        itemCount: resolved.reduce((n, l) => n + l.qty, 0),
        items: resolved.map((l) => l.id),
      },
      { visitorId: order.visitorId, sessionId: order.sessionId, eventId: crypto.randomUUID() }
    );
    if (!tracked.ok) {
      console.error("order_created tracking failed", tracked);
    }

    res.status(201).json({
      orderId: order.id,
      totalCents,
      items: resolved,
      tracked: tracked.ok,
    });
  });

  app.use((err, _req, res, _next) => {
    if (err?.type === "entity.parse.failed") {
      return res.status(400).json({ error: "malformed JSON" });
    }
    console.error(err);
    res.status(500).json({ error: "internal error" });
  });

  return app;
}
