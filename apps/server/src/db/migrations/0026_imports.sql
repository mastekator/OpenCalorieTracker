-- Diary import (ADR-0026 §5): drafts and done imports, the meals they wrote, and dish sources
-- 'import' and 'api' (the public API, ADR-0027) in one rebuild.
CREATE TABLE imports (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('oct', 'csv', 'mfp', 'cronometer')),
  file_sha256 TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'done')),
  mapping TEXT, -- JSON column mapping and date order ("Other CSV")
  records INTEGER, -- dishes written, for the history
  created_at INTEGER NOT NULL,
  committed_at INTEGER
);
CREATE INDEX imports_user ON imports (user_id, status);
ALTER TABLE meals ADD COLUMN import_id INTEGER REFERENCES imports (id) ON DELETE SET NULL;
CREATE INDEX meals_import ON meals (import_id);

-- SQLite cannot change a CHECK in place, so the table is rebuilt (see 0018_meal_barcode).
CREATE TABLE meal_items_new (
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
  source TEXT NOT NULL
    CHECK (source IN ('ai', 'manual', 'history', 'recipe', 'barcode', 'label', 'import', 'api')),
  ai_provider TEXT,
  ai_model TEXT,
  confidence REAL,
  illustration TEXT, -- manual choice on this dish; NULL = automatic
  recipe_id INTEGER REFERENCES recipes (id) ON DELETE SET NULL,
  barcode TEXT, -- normalized GTIN
  unit TEXT NOT NULL DEFAULT 'g' CHECK (unit IN ('g', 'ml'))
);
INSERT INTO meal_items_new (id, meal_id, position, name, name_key, grams, kcal, protein_g, fat_g,
  carbs_g, source, ai_provider, ai_model, confidence, illustration, recipe_id, barcode, unit)
SELECT id, meal_id, position, name, name_key, grams, kcal, protein_g, fat_g,
  carbs_g, source, ai_provider, ai_model, confidence, illustration, recipe_id, barcode, unit
FROM meal_items;
DROP TABLE meal_items;
ALTER TABLE meal_items_new RENAME TO meal_items;
CREATE INDEX meal_items_meal_id ON meal_items (meal_id);
CREATE INDEX meal_items_name_key ON meal_items (name_key);
CREATE INDEX meal_items_recipe_id ON meal_items (recipe_id);
