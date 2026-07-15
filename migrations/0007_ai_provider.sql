PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS ai_provider_configs (
  owner_id TEXT PRIMARY KEY REFERENCES platform_accounts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK(provider IN ('deepseek','openai-compatible')),
  label TEXT NOT NULL,
  base_url TEXT NOT NULL,
  model TEXT NOT NULL,
  api_key_ciphertext BLOB NOT NULL,
  api_key_iv BLOB NOT NULL,
  key_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_optimizer_runs (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES platform_accounts(id),
  work_id TEXT NOT NULL REFERENCES works(id),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('completed','failed','cancelled')),
  error_code TEXT,
  created_at TEXT NOT NULL,
  finished_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_optimizer_runs_owner_created_idx ON ai_optimizer_runs(owner_id, created_at DESC);
