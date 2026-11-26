-- Streak facts: earned awards and month challenges (ADR-0032 §3). Add-only; the client computes the rest.
ALTER TABLE users ADD COLUMN streaks_enabled INTEGER; -- NULL = the default by age

CREATE TABLE awards (
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  key TEXT NOT NULL, -- catalog key in shared
  earned_on TEXT NOT NULL, -- 'YYYY-MM-DD', the diary day it was earned
  seen INTEGER NOT NULL DEFAULT 0, -- the congratulation was shown
  rev INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);
CREATE INDEX awards_user_rev ON awards (user_id, rev);

CREATE TABLE challenge_months (
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  month TEXT NOT NULL, -- 'YYYY-MM'
  keys TEXT NOT NULL, -- JSON array: the month's challenges, first written wins
  done TEXT NOT NULL DEFAULT '{}', -- JSON: { key: 'YYYY-MM-DD' }
  closed INTEGER NOT NULL DEFAULT 0, -- only 0 → 1
  rev INTEGER NOT NULL,
  PRIMARY KEY (user_id, month)
);
CREATE INDEX challenge_months_user_rev ON challenge_months (user_id, rev);
