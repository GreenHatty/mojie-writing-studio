PRAGMA foreign_keys = ON;

-- Core operations are deliberately separate from the legacy ranking, backup,
-- and cloud_documents tables. They use the platform foundation identities and
-- the normalized works/chapters model exclusively.
CREATE TABLE IF NOT EXISTS core_ranking_sources (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL CHECK(platform IN ('qidian','fanqie')),
  adapter_version INTEGER NOT NULL DEFAULT 1,
  list_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '全部',
  source_url TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  authorization_note TEXT NOT NULL,
  last_success_at TEXT,
  last_error_code TEXT,
  created_by TEXT NOT NULL REFERENCES platform_accounts(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS core_ranking_tasks (
  id TEXT PRIMARY KEY,
  source_id TEXT REFERENCES core_ranking_sources(id),
  status TEXT NOT NULL CHECK(status IN ('queued','fetching','parsing','validating','completed','partial','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  progress INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  created_by TEXT NOT NULL REFERENCES platform_accounts(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS core_ranking_tasks_status_created_idx ON core_ranking_tasks(status, created_at);

CREATE TABLE IF NOT EXISTS core_ranking_snapshots (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES core_ranking_sources(id) ON DELETE CASCADE,
  ranking_date TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  item_count INTEGER NOT NULL,
  items_json TEXT NOT NULL,
  analysis_json TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  import_mode TEXT NOT NULL CHECK(import_mode IN ('adapter','manual-csv','manual-json')),
  UNIQUE(source_id, ranking_date, source_hash)
);
CREATE INDEX IF NOT EXISTS core_ranking_snapshots_source_date_idx ON core_ranking_snapshots(source_id, ranking_date DESC, captured_at DESC);

CREATE TABLE IF NOT EXISTS core_publication_records (
  id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL REFERENCES works(id),
  chapter_id TEXT NOT NULL REFERENCES chapters(id),
  platform TEXT NOT NULL CHECK(platform IN ('qidian','fanqie')),
  platform_chapter_id TEXT,
  title TEXT NOT NULL,
  source_revision INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  published_at TEXT NOT NULL,
  recorded_by TEXT NOT NULL REFERENCES platform_accounts(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS core_publication_records_work_created_idx ON core_publication_records(work_id, created_at DESC);

CREATE TABLE IF NOT EXISTS backup_targets (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES platform_accounts(id),
  work_id TEXT REFERENCES works(id),
  label TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK(target_type IN ('webdav','s3-compatible')),
  enabled INTEGER NOT NULL DEFAULT 1,
  interval_minutes INTEGER NOT NULL CHECK(interval_minutes BETWEEN 15 AND 43200),
  retention_hours INTEGER NOT NULL CHECK(retention_hours BETWEEN 1 AND 8760),
  config_ciphertext BLOB NOT NULL,
  config_iv BLOB NOT NULL,
  key_version INTEGER NOT NULL DEFAULT 1,
  last_backup_at TEXT,
  next_backup_at TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS backup_targets_due_idx ON backup_targets(enabled, next_backup_at);
CREATE INDEX IF NOT EXISTS backup_targets_owner_idx ON backup_targets(owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS backup_runs (
  id TEXT PRIMARY KEY,
  target_id TEXT NOT NULL REFERENCES backup_targets(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES platform_accounts(id),
  status TEXT NOT NULL CHECK(status IN ('queued','running','completed','partial','failed','cancelled')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  object_key TEXT,
  content_hash TEXT,
  size_bytes INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS backup_runs_target_created_idx ON backup_runs(target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS backup_runs_status_created_idx ON backup_runs(status, created_at);

CREATE TABLE IF NOT EXISTS backup_objects_v2 (
  id TEXT PRIMARY KEY,
  target_id TEXT NOT NULL REFERENCES backup_targets(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES backup_runs(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES platform_accounts(id),
  work_id TEXT REFERENCES works(id),
  object_key TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  deleted_at TEXT,
  delete_error_code TEXT
);
CREATE INDEX IF NOT EXISTS backup_objects_v2_expiry_idx ON backup_objects_v2(deleted_at, expires_at);
