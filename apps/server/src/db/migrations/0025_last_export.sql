-- The user's last finished export (ADR-0026 §4), for the export card of the integrations hub.
ALTER TABLE users ADD COLUMN last_export_at INTEGER;
ALTER TABLE users ADD COLUMN last_export_format TEXT CHECK (last_export_format IN ('json', 'csv'));
