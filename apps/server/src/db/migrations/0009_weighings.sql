-- Weight diary (ADR-0016 §1): one weighing per user and date; weight_kg NULL is a deleted
-- weighing kept so the deletion syncs by rev. The profile's current weight becomes the first
-- weighing, dated by the profile's last save in the process time zone (as serverToday()).

CREATE TABLE weighings (
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  date TEXT NOT NULL, -- 'YYYY-MM-DD'
  weight_kg REAL, -- NULL = deleted
  rev INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, date)
);
CREATE INDEX weighings_user_rev ON weighings (user_id, rev);

UPDATE users SET sync_rev = sync_rev + 1
WHERE id IN (SELECT user_id FROM profiles WHERE weight_kg IS NOT NULL);
INSERT INTO weighings (user_id, date, weight_kg, rev, updated_at)
SELECT p.user_id, date(p.updated_at / 1000, 'unixepoch', 'localtime'), p.weight_kg, u.sync_rev, p.updated_at
FROM profiles p JOIN users u ON u.id = p.user_id
WHERE p.weight_kg IS NOT NULL;
