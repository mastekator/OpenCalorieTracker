-- Consent to send the user's data to an AI provider through the server (ADR-0031 §3).
-- No rows for existing users: everyone sees the consent sheet at their first AI action (AC-C.7).
CREATE TABLE ai_consents (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_key TEXT NOT NULL,
  granted_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, provider_key)
);
