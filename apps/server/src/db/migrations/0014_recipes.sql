-- Recipes (ADR-0023 §1): ingredients and steps are child rows, totals per ingredient's grams, unrounded.
-- AUTOINCREMENT: a deleted recipe's id is never reused, so a queued portion or a tombstone cannot hit a new recipe.

CREATE TABLE recipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  cooked_g REAL, -- NULL = per 100 g uses the raw weight
  servings INTEGER, -- NULL = grams only
  note TEXT,
  photo_id TEXT UNIQUE,
  last_logged_at INTEGER,
  rev INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX recipes_user_rev ON recipes (user_id, rev);

CREATE TABLE recipe_ingredients (
  id INTEGER PRIMARY KEY,
  recipe_id INTEGER NOT NULL REFERENCES recipes (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  grams REAL NOT NULL, -- 0 allowed (salt, spices)
  kcal REAL NOT NULL,
  protein_g REAL NOT NULL,
  fat_g REAL NOT NULL,
  carbs_g REAL NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('manual', 'history', 'ai'))
);
CREATE INDEX recipe_ingredients_recipe_id ON recipe_ingredients (recipe_id);

CREATE TABLE recipe_steps (
  id INTEGER PRIMARY KEY,
  recipe_id INTEGER NOT NULL REFERENCES recipes (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  text TEXT NOT NULL,
  photo_id TEXT UNIQUE
);
CREATE INDEX recipe_steps_recipe_id ON recipe_steps (recipe_id);

CREATE TABLE recipe_tombstones (
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  recipe_id INTEGER NOT NULL,
  rev INTEGER NOT NULL,
  PRIMARY KEY (user_id, recipe_id)
);
CREATE INDEX recipe_tombstones_user_rev ON recipe_tombstones (user_id, rev);

-- meal_items: source gets 'recipe' and the dish links to its recipe. SQLite cannot change a CHECK
-- in place, so the table is rebuilt (see 0005_photo_retention).
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
  source TEXT NOT NULL CHECK (source IN ('ai', 'manual', 'history', 'recipe')),
  ai_provider TEXT,
  ai_model TEXT,
  confidence REAL,
  illustration TEXT, -- manual choice on this dish; NULL = automatic
  recipe_id INTEGER REFERENCES recipes (id) ON DELETE SET NULL
);
INSERT INTO meal_items_new (id, meal_id, position, name, name_key, grams, kcal, protein_g, fat_g,
  carbs_g, source, ai_provider, ai_model, confidence, illustration)
SELECT id, meal_id, position, name, name_key, grams, kcal, protein_g, fat_g,
  carbs_g, source, ai_provider, ai_model, confidence, illustration
FROM meal_items;
DROP TABLE meal_items;
ALTER TABLE meal_items_new RENAME TO meal_items;
CREATE INDEX meal_items_meal_id ON meal_items (meal_id);
CREATE INDEX meal_items_name_key ON meal_items (name_key);
CREATE INDEX meal_items_recipe_id ON meal_items (recipe_id);
