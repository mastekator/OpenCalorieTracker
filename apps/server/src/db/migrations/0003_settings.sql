-- Account settings revision and the per-user sync counter (ADR-0011 §3). locale, theme and units come from 0001.

ALTER TABLE users ADD COLUMN settings_rev INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN settings_edited_at INTEGER;
ALTER TABLE users ADD COLUMN sync_rev INTEGER NOT NULL DEFAULT 0;
