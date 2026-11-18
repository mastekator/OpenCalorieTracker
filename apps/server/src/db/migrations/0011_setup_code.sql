-- First-run wizard setup code (ADR-0021 §2): sha256 of the current code; one row at most.

CREATE TABLE setup_code (
  id INTEGER PRIMARY KEY CHECK (id = 1), -- at most one valid code
  hash BLOB NOT NULL,
  expires_at INTEGER NOT NULL,
  fail_count INTEGER NOT NULL DEFAULT 0
);
