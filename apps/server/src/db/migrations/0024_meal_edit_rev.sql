-- Revision of the last user edit of a meal (ADR-0022 §1): only POST and an applied PATCH set it,
-- so service changes (photo sweep) move `rev` without making a later edit a conflict.
ALTER TABLE meals ADD COLUMN edit_rev INTEGER NOT NULL DEFAULT 0;
UPDATE meals SET edit_rev = rev;
