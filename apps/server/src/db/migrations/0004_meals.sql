-- Meals, their dishes and remembered illustrations (ADR-0009). Dish numbers are totals for the dish weight, unrounded.

CREATE TABLE meals (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  eaten_at INTEGER NOT NULL,
  tz_offset_min INTEGER NOT NULL,
  local_date TEXT NOT NULL, -- 'YYYY-MM-DD' on the device
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  photo_id TEXT UNIQUE,
  photo_full INTEGER NOT NULL DEFAULT 0,
  photo_expires_at INTEGER,
  recalc_offer INTEGER NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (user_id, client_id)
);
CREATE INDEX meals_user_local_date ON meals (user_id, local_date);

CREATE TABLE meal_items (
  id INTEGER PRIMARY KEY,
  meal_id INTEGER NOT NULL REFERENCES meals (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  grams REAL NOT NULL,
  kcal REAL NOT NULL,
  protein_g REAL NOT NULL,
  fat_g REAL NOT NULL,
  carbs_g REAL NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('ai', 'manual', 'history')),
  ai_provider TEXT,
  ai_model TEXT,
  confidence REAL,
  illustration TEXT -- manual choice on this dish; NULL = automatic
);
CREATE INDEX meal_items_meal_id ON meal_items (meal_id);
CREATE INDEX meal_items_name_key ON meal_items (name_key);

CREATE TABLE illustration_choices (
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name_key TEXT NOT NULL,
  illustration TEXT NOT NULL,
  rev INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, name_key)
);
