-- recipes: a recipe without ingredients keeps its nutrients per 100 g and serving weight
-- (ADR-0035 §1). per100_kcal NULL = the recipe is computed from its ingredients.
ALTER TABLE recipes ADD COLUMN per100_kcal REAL;
ALTER TABLE recipes ADD COLUMN per100_protein_g REAL;
ALTER TABLE recipes ADD COLUMN per100_fat_g REAL;
ALTER TABLE recipes ADD COLUMN per100_carbs_g REAL;
ALTER TABLE recipes ADD COLUMN serving_g REAL;
