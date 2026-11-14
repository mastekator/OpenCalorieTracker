-- Norm agent dialog and draft (ADR-0015 §4). Not synced: the agent is online only.

CREATE TABLE agent_messages (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  kind TEXT NOT NULL,
  -- JSON of the message without role and kind; text messages carry `text` (and `ask`).
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX agent_messages_user ON agent_messages (user_id, id);

CREATE TABLE agent_drafts (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- JSON InterviewDraft: checked profile fields, "don't know" answers, pace warned.
  draft TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('active', 'summary', 'minor')),
  user_turns INTEGER NOT NULL DEFAULT 0,
  limit_offered INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
