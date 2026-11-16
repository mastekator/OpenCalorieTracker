-- Last edit wins for illustration choices, as for meals and settings: Unix ms of the user's choice.
-- Existing rows keep NULL, so the next choice always applies.

ALTER TABLE illustration_choices ADD COLUMN edited_at INTEGER;
