-- Personal API tokens for /api/v1 and /mcp (ADR-0027 §1). Only the sha256 of the token is stored.
CREATE TABLE api_tokens (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('read', 'write')),
  token_hash BLOB NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER, -- NULL: never expires
  last_used_at INTEGER
);
CREATE INDEX api_tokens_user ON api_tokens (user_id);

-- The admin's switch for tokens (ADR-0027 §6). ALLOW_API_TOKENS in env overrides it.
ALTER TABLE integration_settings ADD COLUMN tokens_allowed INTEGER NOT NULL DEFAULT 1;
