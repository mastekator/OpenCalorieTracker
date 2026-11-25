-- The user's own switch for read-only access through /mcp (ADR-0027 §7); off by default.
ALTER TABLE users ADD COLUMN mcp_enabled INTEGER NOT NULL DEFAULT 0;
