-- The user's package weight, pieces and last amount for a barcode (ADR-0037 §2). Personal: per user.
CREATE TABLE product_prefs (
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  pack_g REAL,
  pieces INTEGER,
  amount_mode TEXT CHECK (amount_mode IN ('pack', 'serving', 'piece', 'weight')),
  amount_value REAL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, code)
);
