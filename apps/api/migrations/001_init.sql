CREATE TABLE IF NOT EXISTS events (
  id              BIGSERIAL PRIMARY KEY,
  event_id        UUID NOT NULL,
  event_name      TEXT NOT NULL,
  source          TEXT NOT NULL CHECK (source IN ('browser', 'server')),
  occurred_at     TIMESTAMPTZ NOT NULL,
  received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  visitor_id      TEXT,
  session_id      TEXT,
  properties      JSONB NOT NULL DEFAULT '{}'::jsonb,
  page_url        TEXT,
  user_agent      TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS events_event_id_uidx ON events (event_id);
CREATE INDEX IF NOT EXISTS events_occurred_at_idx ON events (occurred_at);
CREATE INDEX IF NOT EXISTS events_name_time_idx ON events (event_name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS events_visitor_time_idx ON events (visitor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS events_source_time_idx ON events (source, occurred_at DESC);
CREATE INDEX IF NOT EXISTS events_page_path_idx ON events ((properties->>'path')) WHERE event_name = 'page_view';

CREATE TABLE IF NOT EXISTS orders (
  id              TEXT PRIMARY KEY,
  items           JSONB NOT NULL,
  total_cents     INTEGER NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  visitor_id      TEXT,
  session_id      TEXT
);
