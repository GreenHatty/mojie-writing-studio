PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS ranking_tasks (
  id TEXT PRIMARY KEY,
  source_id TEXT,
  status TEXT NOT NULL CHECK(status IN ('queued','fetching','parsing','validating','completed','partial','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  progress INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  FOREIGN KEY (source_id) REFERENCES ranking_sources(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS ranking_tasks_status_created_idx ON ranking_tasks(status, created_at);
CREATE INDEX IF NOT EXISTS ranking_tasks_source_created_idx ON ranking_tasks(source_id, created_at DESC);
