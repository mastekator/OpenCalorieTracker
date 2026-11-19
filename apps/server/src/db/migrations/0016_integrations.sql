-- Outbound requests (ADR-0034 §5, ADR-0027 §6). No row: allowed. ALLOW_OUTBOUND_REQUESTS in env overrides it.

CREATE TABLE integration_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  outbound_allowed INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  updated_by INTEGER REFERENCES users (id) ON DELETE SET NULL
);

-- Barcode lookup in Open Food Facts: off until the user turns it on (AC-0.1).
ALTER TABLE users ADD COLUMN off_enabled INTEGER NOT NULL DEFAULT 0;
-- When the user dismissed the "turn on barcode lookup" hint (ISO date-time).
ALTER TABLE users ADD COLUMN off_hint_at TEXT;
