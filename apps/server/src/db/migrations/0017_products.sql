-- Barcode products (ADR-0034 §4, §6). Shared Open Food Facts cache: not personal data, no user column.
CREATE TABLE food_products (
  code TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('found', 'missing')),
  names TEXT, -- JSON {locale: name}, "default" = product_name
  brand TEXT,
  kcal_100 REAL,
  protein_100 REAL,
  fat_100 REAL,
  carbs_100 REAL,
  per TEXT CHECK (per IN ('g', 'ml')),
  serving_g REAL,
  serving_text TEXT,
  fetched_at INTEGER NOT NULL
);

-- The user's own products: win over the cache and Open Food Facts (E-8).
CREATE TABLE user_products (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  brand TEXT,
  kcal_100 REAL NOT NULL,
  protein_100 REAL,
  fat_100 REAL,
  carbs_100 REAL,
  per TEXT NOT NULL CHECK (per IN ('g', 'ml')),
  serving_g REAL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (user_id, code)
);
