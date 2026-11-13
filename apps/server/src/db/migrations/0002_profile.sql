-- Profile and manual norm (ADR-0014 §1). Inputs only, in cm and kg without rounding; the norm is computed on read.

CREATE TABLE profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  sex TEXT CHECK (sex IN ('male', 'female')),
  birth_date TEXT, -- 'YYYY-MM-DD'
  height_cm REAL,
  weight_kg REAL,
  activity TEXT CHECK (activity IN ('minimal', 'light', 'moderate', 'high', 'very_high')),
  goal TEXT CHECK (goal IN ('lose', 'maintain', 'gain')),
  target_weight_kg REAL,
  deadline TEXT, -- 'YYYY-MM-DD'
  kcal_override INTEGER,
  protein_pct INTEGER,
  fat_pct INTEGER,
  carbs_pct INTEGER,
  rev INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  -- The manual norm is stored whole or not at all.
  CHECK ((kcal_override IS NULL) = (protein_pct IS NULL)
     AND (kcal_override IS NULL) = (fat_pct IS NULL)
     AND (kcal_override IS NULL) = (carbs_pct IS NULL))
);

ALTER TABLE users ADD COLUMN norm_disclaimer_hidden INTEGER NOT NULL DEFAULT 0;
