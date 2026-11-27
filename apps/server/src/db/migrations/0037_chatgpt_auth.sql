-- The admin's ChatGPT sign-in for the server provider chatgpt (ADR-0031 §4); no row is signed out.
CREATE TABLE chatgpt_auth (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  client_id TEXT NOT NULL, -- the issued oaiapp_…, never dynamic_agent_client
  account_label TEXT, -- email from the id_token, if any
  access_enc TEXT NOT NULL, -- Secrets.seal(…, 'chatgpt.access')
  refresh_enc TEXT NOT NULL, -- Secrets.seal(…, 'chatgpt.refresh')
  expires_at INTEGER NOT NULL,
  earliest_refresh_at INTEGER,
  signed_in_at INTEGER NOT NULL,
  rev INTEGER NOT NULL
);
