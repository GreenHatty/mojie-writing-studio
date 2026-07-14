PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS project_entities (
  id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL REFERENCES works(id),
  kind TEXT NOT NULL CHECK(kind IN ('outline','chapter-plan','character','location','timeline','relationship','material','world','faction')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  fields_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL REFERENCES platform_accounts(id),
  updated_by TEXT NOT NULL REFERENCES platform_accounts(id),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES platform_accounts(id),
  delete_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS project_entities_work_kind_updated_idx
  ON project_entities(work_id, kind, updated_at DESC);
CREATE INDEX IF NOT EXISTS project_entities_work_deleted_idx
  ON project_entities(work_id, deleted_at);
