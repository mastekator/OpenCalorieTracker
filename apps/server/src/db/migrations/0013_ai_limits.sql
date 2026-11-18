-- Admin's AI limits (ADR-0020 §6); one row at most. No row or NULL: no limit.

CREATE TABLE ai_limits (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  refine_per_session INTEGER CHECK (refine_per_session BETWEEN 1 AND 50)
);
