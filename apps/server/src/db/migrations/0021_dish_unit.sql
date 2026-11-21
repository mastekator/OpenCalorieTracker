-- Dish and recipe ingredient unit (ADR-0038 §1): `grams` holds the amount in
-- this unit. Existing rows are grams.
ALTER TABLE meal_items ADD COLUMN unit TEXT NOT NULL DEFAULT 'g' CHECK (unit IN ('g', 'ml'));
ALTER TABLE recipe_ingredients ADD COLUMN unit TEXT NOT NULL DEFAULT 'g' CHECK (unit IN ('g', 'ml'));
