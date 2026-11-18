-- AI settings saved by the admin (ADR-0018 §2); one row at most. AI_* in env override it whole.

CREATE TABLE ai_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  base_url TEXT,
  api_key_enc TEXT, -- Secrets.seal(); NULL for openai-compatible without a key
  api_key_last4 TEXT, -- shown as "…abcd" without decrypting
  rev INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by INTEGER REFERENCES users (id) ON DELETE SET NULL
);
