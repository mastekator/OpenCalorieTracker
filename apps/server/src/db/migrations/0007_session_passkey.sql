-- The passkey a session was opened or last extended with, for the "this device" badge in "My passkeys".
-- Removing that passkey keeps the session signed in (AC-6.3).

ALTER TABLE sessions ADD COLUMN passkey_id INTEGER REFERENCES passkeys (id) ON DELETE SET NULL;
