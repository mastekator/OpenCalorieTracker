-- The test set version of a model test run (ADR-0033 §4); runs before it used set 1.

ALTER TABLE ai_test_runs ADD COLUMN test_set INTEGER NOT NULL DEFAULT 1;
