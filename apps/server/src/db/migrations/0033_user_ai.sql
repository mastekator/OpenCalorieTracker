-- The user's own AI key (ADR-0031 §2); the row is the source "own key", no row is "through the server".
CREATE TABLE user_ai_settings (
  user_id INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  base_url TEXT,
  api_key_enc TEXT, -- Secrets.seal(…, 'user_ai.api_key')
  api_key_last4 TEXT,
  updated_at INTEGER NOT NULL
);

-- Instance-wide AI switches; apart from ai_settings, which is empty with AI_* in env.
-- ALLOW_USER_AI_KEYS in env wins over allow_user_keys. host_id never changes (ChatGPT sign-in, ADR-0031 §4).
CREATE TABLE instance_ai (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  allow_user_keys INTEGER NOT NULL DEFAULT 1,
  host_id TEXT NOT NULL
);
-- A random v4 UUID.
INSERT INTO instance_ai (id, host_id) VALUES (1,
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-'
    || substr('89ab', 1 + abs(random()) % 4, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))));

-- 0 after the admin deleted this user's key: GET /api/ai/status says so until settings are opened.
ALTER TABLE users ADD COLUMN ai_notice_seen INTEGER NOT NULL DEFAULT 1;

-- Where the AI items of the meal came from: server / own_key / device; support only, not shown.
ALTER TABLE meals ADD COLUMN ai_source TEXT;
