-- Sign-in and users (ADR-0002, ADR-0003). Times are Unix milliseconds UTC; booleans are 0/1.

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  webauthn_user_id BLOB NOT NULL UNIQUE,
  locale TEXT NOT NULL DEFAULT 'en',
  theme TEXT NOT NULL DEFAULT 'system',
  units TEXT NOT NULL DEFAULT 'metric',
  photo_retention_days INTEGER NOT NULL DEFAULT 30,
  password_from_config INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER
);

CREATE TABLE passwords (
  user_id INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  hash TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE passkeys (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  credential_id BLOB NOT NULL UNIQUE,
  public_key BLOB NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT,
  name TEXT,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);
CREATE INDEX passkeys_user_id ON passkeys (user_id);

-- Invites, recovery links and the admin setup link.
CREATE TABLE invites (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('invite', 'recovery')),
  email TEXT,
  user_id INTEGER REFERENCES users (id) ON DELETE CASCADE,
  token_hash BLOB NOT NULL UNIQUE,
  created_by INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  revoked_at INTEGER
);
CREATE INDEX invites_email ON invites (email);

CREATE TABLE sessions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash BLOB NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  user_agent TEXT
);
CREATE INDEX sessions_user_id ON sessions (user_id);

CREATE TABLE login_guards (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('device', 'ip')),
  ip TEXT NOT NULL,
  -- '' for ip rows: NULLs are distinct in UNIQUE, which would defeat upserts.
  device_id TEXT NOT NULL DEFAULT '',
  fail_count INTEGER NOT NULL DEFAULT 0,
  window_started_at INTEGER,
  timeout_count INTEGER NOT NULL DEFAULT 0,
  timeouts_window_started_at INTEGER,
  timeout_until INTEGER,
  blocked_at INTEGER,
  last_email TEXT,
  user_agent TEXT,
  last_fail_at INTEGER,
  UNIQUE (kind, ip, device_id)
);
