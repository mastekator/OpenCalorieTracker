-- food_products: package weight from Open Food Facts product_quantity (ADR-0037 §1).
-- Cached answers lack it, so they go stale and are asked again.
ALTER TABLE food_products ADD COLUMN pack_g REAL;
UPDATE food_products SET fetched_at = 0;
