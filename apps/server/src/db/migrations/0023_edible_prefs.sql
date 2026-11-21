-- The user's edible share of a dish by reference key (ADR-0039 §4). Personal: per user.
CREATE TABLE edible_prefs (
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  pct INTEGER NOT NULL CHECK (pct BETWEEN 10 AND 100),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);
