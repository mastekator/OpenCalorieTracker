-- Webhooks (ADR-0027 §3). The secret is sealed with Secrets: it signs every delivery, so a hash won't do.
CREATE TABLE webhooks (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  secret_enc TEXT NOT NULL,
  events TEXT NOT NULL, -- JSON array of meal.saved | day.closed | day.empty
  day_closed_at TEXT NOT NULL DEFAULT '23:59',
  empty_by TEXT, -- 'HH:MM' for day.empty
  enabled INTEGER NOT NULL DEFAULT 1,
  fail_streak INTEGER NOT NULL DEFAULT 0,
  disabled_reason TEXT, -- 'failures' after 20 failed deliveries in a row
  created_at INTEGER NOT NULL
);
CREATE INDEX webhooks_user ON webhooks (user_id);

-- Events waiting for delivery; written in the same transaction as the meal.
CREATE TABLE webhook_outbox (
  id INTEGER PRIMARY KEY,
  webhook_id INTEGER NOT NULL REFERENCES webhooks (id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  body TEXT NOT NULL, -- the JSON sent as is
  attempts INTEGER NOT NULL DEFAULT 0,
  next_at INTEGER NOT NULL
);
CREATE INDEX webhook_outbox_next ON webhook_outbox (next_at);

-- The delivery log, the last 20 per webhook.
CREATE TABLE webhook_deliveries (
  id INTEGER PRIMARY KEY,
  webhook_id INTEGER NOT NULL REFERENCES webhooks (id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  at INTEGER NOT NULL,
  status INTEGER, -- HTTP status; NULL: no response
  error TEXT, -- timeout | refused | blocked_address | …
  attempts INTEGER NOT NULL,
  duration_ms INTEGER
);
CREATE INDEX webhook_deliveries_webhook ON webhook_deliveries (webhook_id, id);

-- Timed events go out once a day and survive a restart.
CREATE TABLE webhook_schedule (
  webhook_id INTEGER NOT NULL REFERENCES webhooks (id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  last_date TEXT NOT NULL,
  PRIMARY KEY (webhook_id, event)
);
