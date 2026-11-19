-- meal_items: the dish keeps its barcode and source gets 'barcode' and 'label' (ADR-0034 §6).
-- SQLite cannot change a CHECK in place, so the table is rebuilt (see 0014_recipes).
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
    CHECK (source IN ('ai', 'manual', 'history', 'recipe', 'barcode', 'label')),
  ai_provider TEXT,
  ai_model TEXT,
  confidence REAL,
  illustration TEXT, -- manual choice on this dish; NULL = automatic
  recipe_id INTEGER REFERENCES recipes (id) ON DELETE SET NULL,
  barcode TEXT -- normalized GTIN
);
INSERT INTO meal_items_new (id, meal_id, position, name, name_key, grams, kcal, protein_g, fat_g,
  carbs_g, source, ai_provider, ai_model, confidence, illustration, recipe_id)
SELECT id, meal_id, position, name, name_key, grams, kcal, protein_g, fat_g,
  carbs_g, source, ai_provider, ai_model, confidence, illustration, recipe_id
FROM meal_items;
DROP TABLE meal_items;
ALTER TABLE meal_items_new RENAME TO meal_items;
CREATE INDEX meal_items_meal_id ON meal_items (meal_id);
CREATE INDEX meal_items_name_key ON meal_items (name_key);
CREATE INDEX meal_items_recipe_id ON meal_items (recipe_id);
