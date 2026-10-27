# Application analytics platform

End-to-end analytics for a restaurant demo: a reusable **browser SDK**, a **server tracking helper**, a **PostgreSQL-backed ingestion API**, and a **React dashboard**.

## Architecture

```
Restaurant (React :5173) --page views & clicks--> Browser SDK --POST /v1/events--> API (Express :4000)
Restaurant --POST /api/orders--> API --order_created--> Server SDK --POST /v1/events--> API
Dashboard (React :5174) --GET /v1/analytics/*--> API --SQL--> PostgreSQL
```

- **Browser SDK** (`packages/browser-sdk`): visitor/session IDs, automatic `page_view` (including SPA history), custom `track()`, local retry queue, `sendBeacon` on hide, never throws to the host app.
- **Server SDK** (`packages/server-sdk`): `track(name, properties, context)` for business events; returns `{ ok }` instead of throwing.
- **API** (`apps/api`): write-key ingest, dashboard-key queries, restaurant menu/orders, validation, duplicate suppression.
- **Dashboard** (`apps/dashboard`): date-range KPIs, popular pages, event counts, trend bars.
- **Restaurant** (`apps/restaurant`): home, menu, cart, place order.

## Identity model

| ID | Storage | Lifetime |
| --- | --- | --- |
| `visitor_id` | `localStorage` (`aa_visitor_id`) | Durable per browser profile |
| `session_id` | `sessionStorage` (`aa_session_id`) | New after 30 minutes idle or new tab session |
| `event_id` | Generated per event (UUID) | Deduplicates retries (`UNIQUE`) |

Server events may attach the same `visitor_id` / `session_id` when the restaurant checkout request includes them, so `order_created` joins the browser session.

## Event schema

Ingest body:

```json
{
  "events": [
    {
      "event_id": "uuid",
      "event_name": "page_view",
      "source": "browser | server",
      "occurred_at": "ISO-8601",
      "visitor_id": "string | null",
      "session_id": "string | null",
      "properties": { "path": "/menu" },
      "page_url": "https://...",
      "user_agent": "..."
    }
  ]
}
```

Demo event names:

- Browser: `page_view`, `home_cta_impression`, `cta_clicked`, `menu_viewed`, `add_to_cart`, `checkout_started`, `checkout_completed`, `checkout_failed`
- Server: `order_created` (`orderId`, `totalCents`, `itemCount`, `items`)

## API endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/v1/events` | `X-Write-Key` (or `?key=` for beacon) | Ingest 1–25 events |
| `GET` | `/v1/analytics/summary` | `X-Dashboard-Key` | Page views, unique visitors, total events |
| `GET` | `/v1/analytics/pages` | `X-Dashboard-Key` | Popular pages |
| `GET` | `/v1/analytics/events` | `X-Dashboard-Key` | Counts by name/source |
| `GET` | `/v1/analytics/trends` | `X-Dashboard-Key` | Hourly or daily buckets |
| `GET` | `/api/menu` | none | Demo menu |
| `POST` | `/api/orders` | none (demo) | Create order + `order_created` |
| `GET` | `/health` | none | Liveness |

Analytics query params: `from`, `to` (ISO timestamps). Default last 7 days, max 90 days.

## Database schema

`events`: `event_id` (unique), `event_name`, `source`, `occurred_at`, `received_at`, `visitor_id`, `session_id`, `properties` (JSONB), `page_url`, `user_agent`.

Indexes: time, name+time, visitor+time, source+time, `page_view` path expression.

`orders`: demo persistence for checkout (`id`, `items`, `total_cents`, visitor/session).

Migrations live in `apps/api/migrations/`.

## Design decisions

- **Keys over cookies for ingest**: a shared write key is enough for a first-party demo; query APIs use a separate dashboard key so a leaked SDK key cannot read data.
- **Client-generated `event_id` + `ON CONFLICT DO NOTHING`**: retries and double-clicks do not inflate counts.
- **Partial batch acceptance**: valid events persist even if some rows in the batch fail validation.
- **In-memory rate limit**: cheap abuse brake for local/demo; not a substitute for a gateway in production.
- **Self-HTTP for server events**: the API uses the same server SDK as any other backend, so the helper is actually exercised on `order_created`.
- **Beacon as `text/plain`**: `sendBeacon` cannot reliably set `X-Write-Key` or CORS JSON content types, so unload uses `?key=` and a JSON body with a plain content type.

## Assumptions

- Single-tenant demo (one write key, one dashboard key).
- Restaurant checkout is unauthenticated.
- Unique visitors are distinct `visitor_id` values, not logged-in users.
- Clock skew for `occurred_at` is allowed within 7 days.
- Docker is used for PostgreSQL only; Node apps run on the host for simpler Vite HMR.

## Limitations

- Rate limiter is per-process and resets on restart.
- No user auth, no multi-project tenancy, no bot filtering.
- Trend chart is a simple total-events bar, not a full time-series UI.
- `sendBeacon` payloads may still be dropped by the browser; the retry queue covers online `fetch` failures only.
- Server tracking of orders is best-effort: the order is saved even if ingest is down (`tracked: false`).

## Deploy to Render (free tier)

This repo includes a `render.yaml` [Blueprint](https://render.com/docs/blueprint-spec) that provisions:
- **sdk-demo-api** — Node/Express web service
- **sdk-demo-restaurant** — React static site
- **sdk-demo-dashboard** — React static site
- **sdk-demo-db** — Free managed PostgreSQL

### Steps

1. Go to [render.com](https://render.com) and sign in (or create a free account).
2. Click **New → Blueprint** and connect your GitHub account.
3. Select the **`Mr-WebDevloper/demo`** repository.
4. Render will read `render.yaml` and create all services automatically.
5. After the first deploy completes, you need to sync the auto-generated keys:
   - Go to **sdk-demo-api → Environment** and copy the values of `WRITE_KEY` and `DASHBOARD_KEY`.
   - Go to **sdk-demo-restaurant → Environment** and set `VITE_WRITE_KEY` to the copied `WRITE_KEY`.
   - Go to **sdk-demo-dashboard → Environment** and set `VITE_DASHBOARD_KEY` to the copied `DASHBOARD_KEY`.
   - Trigger a manual re-deploy on both front-end services after setting the keys.

### Live URLs (after deploy)

| Service | URL |
| --- | --- |
| API | `https://sdk-demo-api.onrender.com` |
| Restaurant | `https://sdk-demo-restaurant.onrender.com` |
| Dashboard | `https://sdk-demo-dashboard.onrender.com` |

> **Note:** Free-tier Render services spin down after 15 minutes of inactivity. The first request after sleep may take ~30 seconds.

### Required environment variables

All set automatically by `render.yaml` except two (marked `sync: false` — set manually after first deploy):

| Variable | Service | How to get |
| --- | --- | --- |
| `DATABASE_URL` | API | Auto-injected from linked Postgres |
| `WRITE_KEY` | API | Auto-generated by Render |
| `DASHBOARD_KEY` | API | Auto-generated by Render |
| `VITE_API_BASE_URL` | Restaurant, Dashboard | Pre-set to `https://sdk-demo-api.onrender.com` |
| `VITE_WRITE_KEY` | Restaurant | Copy from API's `WRITE_KEY` |
| `VITE_DASHBOARD_KEY` | Dashboard | Copy from API's `DASHBOARD_KEY` |

---

## Local setup

Prerequisites: Node.js 20+. Docker is optional.

**Option A — Docker Postgres (preferred if Docker is installed):**

```bash
cp .env.example .env
# set DATABASE_URL=postgres://analytics:analytics@localhost:5432/analytics
docker compose up -d postgres
npm install
npm run migrate
npm test
npm run dev
```

**Option B — Embedded PGlite (default in `.env.example`, no Docker):**

```bash
cp .env.example .env
npm install
npm run migrate
npm test
npm run dev
```

PGlite speaks PostgreSQL SQL (including JSONB, unique indexes, `ON CONFLICT`) and stores files under `data/pglite`. Switch to Docker/Postgres by changing `DATABASE_URL`.

If you already run PostgreSQL on Windows, set `DATABASE_URL` to a user that can create the `analytics` database.

Then:

1. Open http://localhost:5173 — browse Home → Menu, add a dish, place an order.
2. Open http://localhost:5174 — apply the date range and confirm page views, visitors, `add_to_cart`, and `order_created`.

Default keys (from `.env.example`):

- Write key: `dev-write-key-change-me`
- Dashboard key: `dev-dashboard-key-change-me`
