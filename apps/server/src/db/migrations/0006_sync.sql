-- Sync (ADR-0011 §3): last-edit-wins time for meals, tombstones of deleted meals, and
-- "back to automatic" kept as an illustration_choices row with NULL so it syncs by rev.
-- SQLite cannot drop NOT NULL in place, so illustration_choices is rebuilt (see 0005_photo_retention).

ALTER TABLE meals ADD COLUMN edited_at INTEGER;
CREATE INDEX meals_user_rev ON meals (user_id, rev);

CREATE TABLE meal_tombstones (
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  rev INTEGER NOT NULL,
  PRIMARY KEY (user_id, client_id)
);
CREATE INDEX meal_tombstones_user_rev ON meal_tombstones (user_id, rev);

CREATE TABLE illustration_choices_new (
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name_key TEXT NOT NULL,
  illustration TEXT, -- NULL = back to automatic
  rev INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, name_key)
);
INSERT INTO illustration_choices_new (user_id, name_key, illustration, rev)
SELECT user_id, name_key, illustration, rev FROM illustration_choices;
DROP TABLE illustration_choices;
ALTER TABLE illustration_choices_new RENAME TO illustration_choices;
CREATE INDEX illustration_choices_user_rev ON illustration_choices (user_id, rev);
