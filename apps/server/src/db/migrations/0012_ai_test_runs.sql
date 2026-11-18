-- Model test runs on the test photos (ADR-0019 §4); only the 20 newest are kept.

CREATE TABLE ai_test_runs (
  id INTEGER PRIMARY KEY,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL,        -- running | done | stopped | interrupted
  stop_reason TEXT,            -- auth_error | model_not_found | quota_exceeded | user
  app_version TEXT NOT NULL,
  prompt_version INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd REAL,               -- only with a known price (OpenRouter)
  photos TEXT NOT NULL         -- JSON: [{ file, expected, got?, kcal?, levels?, ms?, result }]
);
