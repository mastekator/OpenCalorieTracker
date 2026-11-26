-- Record marks for streaks (ADR-0032 §2).
-- Sticky "logged by photo": set once an AI dish was saved in the meal, never cleared.
ALTER TABLE meals ADD COLUMN recognized INTEGER NOT NULL DEFAULT 0;
UPDATE meals SET recognized = 1
  WHERE EXISTS (SELECT 1 FROM meal_items i WHERE i.meal_id = meals.id AND i.source = 'ai');
-- Unix ms of "Save" on the device, never later than the server's now; NULL reads as created_at.
ALTER TABLE meals ADD COLUMN logged_at INTEGER;
UPDATE meals SET logged_at = created_at;
-- Grams as recognition returned them; AI dishes only.
ALTER TABLE meal_items ADD COLUMN ai_grams REAL;
