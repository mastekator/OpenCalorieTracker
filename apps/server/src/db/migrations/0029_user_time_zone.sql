-- The user's IANA time zone for "today" without a device (ADR-0027 §4–5). NULL: the server's zone.
ALTER TABLE users ADD COLUMN time_zone TEXT;
