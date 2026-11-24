-- recipe_ingredients: source gets 'barcode' (ADR-0040 §2). SQLite cannot change a CHECK in place,
-- so the table is rebuilt (see 0018_meal_barcode).
CREATE TABLE recipe_ingredients_new (
  id INTEGER PRIMARY KEY,
  recipe_id INTEGER NOT NULL REFERENCES recipes (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  grams REAL NOT NULL, -- 0 allowed (salt, spices)
  kcal REAL NOT NULL,
  protein_g REAL NOT NULL,
  fat_g REAL NOT NULL,
  carbs_g REAL NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('manual', 'history', 'ai', 'barcode')),
  unit TEXT NOT NULL DEFAULT 'g' CHECK (unit IN ('g', 'ml'))
);
INSERT INTO recipe_ingredients_new (id, recipe_id, position, name, grams, kcal, protein_g, fat_g,
  carbs_g, source, unit)
SELECT id, recipe_id, position, name, grams, kcal, protein_g, fat_g, carbs_g, source, unit
FROM recipe_ingredients;
DROP TABLE recipe_ingredients;
ALTER TABLE recipe_ingredients_new RENAME TO recipe_ingredients;
CREATE INDEX recipe_ingredients_recipe_id ON recipe_ingredients (recipe_id);
