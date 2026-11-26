-- Water and drinks (ADR-0028 §1).
ALTER TABLE users ADD COLUMN water_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN hidden_drinks TEXT NOT NULL DEFAULT '[]'; -- JSON array of built-in keys

-- The user's own drinks only; built-ins are constants in shared.
CREATE TABLE drinks (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  illustration TEXT NOT NULL,
  kcal REAL NOT NULL, protein_g REAL NOT NULL, fat_g REAL NOT NULL, carbs_g REAL NOT NULL, -- per 100 ml
  counts_water INTEGER NOT NULL DEFAULT 1,
  deleted INTEGER NOT NULL DEFAULT 0, -- kept for sync; past entries never read it
  rev INTEGER NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX drinks_user_rev ON drinks (user_id, rev);

CREATE TABLE drink_entries (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  date TEXT NOT NULL, -- the device's day
  taken_at INTEGER NOT NULL,
  drink_key TEXT, -- 'water', 'coffee'… or 'custom:<id>'; NULL is a drink from a photo
  name TEXT, -- snapshot; NULL for a built-in, translated by drink_key
  illustration TEXT NOT NULL,
  ml INTEGER NOT NULL CHECK (ml BETWEEN 10 AND 2000),
  counts_water INTEGER NOT NULL,
  kcal REAL NOT NULL, protein_g REAL NOT NULL, fat_g REAL NOT NULL, carbs_g REAL NOT NULL, -- whole entry
  deleted INTEGER NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL,
  UNIQUE (user_id, client_id)
);
CREATE INDEX drink_entries_user_rev ON drink_entries (user_id, rev);
CREATE INDEX drink_entries_user_date ON drink_entries (user_id, date);

-- Goal history: the goal of day D is the row with the latest from_date <= D.
CREATE TABLE water_goals (
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  from_date TEXT NOT NULL,
  goal_ml INTEGER CHECK (goal_ml BETWEEN 500 AND 6000), -- NULL = the reference by sex
  rev INTEGER NOT NULL,
  PRIMARY KEY (user_id, from_date)
);
