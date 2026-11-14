-- photo_retention_days becomes nullable: NULL keeps full photos forever (ADR-0008 "Lifecycle").
-- SQLite cannot drop NOT NULL in place, so users is rebuilt; migrate() turns foreign keys off around it.

CREATE TABLE users_new (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  webauthn_user_id BLOB NOT NULL UNIQUE,
  locale TEXT NOT NULL DEFAULT 'en',
  theme TEXT NOT NULL DEFAULT 'system',
  units TEXT NOT NULL DEFAULT 'metric',
  photo_retention_days INTEGER DEFAULT 30,
  password_from_config INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER,
  norm_disclaimer_hidden INTEGER NOT NULL DEFAULT 0,
  settings_rev INTEGER NOT NULL DEFAULT 0,
  settings_edited_at INTEGER,
  sync_rev INTEGER NOT NULL DEFAULT 0
);

INSERT INTO users_new (id, email, name, role, webauthn_user_id, locale, theme, units,
  photo_retention_days, password_from_config, created_at, last_login_at, norm_disclaimer_hidden,
  settings_rev, settings_edited_at, sync_rev)
SELECT id, email, name, role, webauthn_user_id, locale, theme, units,
  photo_retention_days, password_from_config, created_at, last_login_at, norm_disclaimer_hidden,
  settings_rev, settings_edited_at, sync_rev
FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

-- The hourly sweep looks up expired full photos.
CREATE INDEX meals_photo_expires_at ON meals (photo_expires_at) WHERE photo_full = 1;
