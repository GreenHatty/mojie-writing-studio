PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  global_role TEXT NOT NULL DEFAULT 'viewer' CHECK (global_role IN ('owner','admin','writer','editor','commenter','viewer')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  token_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','writer','editor','commenter','viewer')),
  work_id TEXT,
  expires_at TEXT NOT NULL,
  max_uses INTEGER NOT NULL DEFAULT 1,
  used_count INTEGER NOT NULL DEFAULT 0,
  revoked_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  user_agent TEXT,
  ip_hash TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS work_members (
  work_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','writer','editor','commenter','viewer')),
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  PRIMARY KEY (work_id, user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS work_members_user_id_idx ON work_members(user_id);

CREATE TABLE IF NOT EXISTS cloud_documents (
  work_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  title TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  payload_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (owner_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS cloud_documents_owner_id_idx ON cloud_documents(owner_id);

CREATE TABLE IF NOT EXISTS cloud_document_revisions (
  id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (work_id, revision),
  FOREIGN KEY (work_id) REFERENCES cloud_documents(work_id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS docx_assets (
  id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  original_hash TEXT NOT NULL,
  edited_hash TEXT,
  paragraph_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS docx_assets_work_id_idx ON docx_assets(work_id);

CREATE TABLE IF NOT EXISTS ranking_sources (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL CHECK (platform IN ('qidian','fanqie')),
  list_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '全部',
  source_url TEXT NOT NULL,
  parser_type TEXT NOT NULL DEFAULT 'auto',
  enabled INTEGER NOT NULL DEFAULT 1,
  authorization_note TEXT NOT NULL,
  last_success_at TEXT,
  last_error TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS ranking_snapshots (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  ranking_date TEXT NOT NULL,
  items_json TEXT NOT NULL,
  common_elements_json TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  FOREIGN KEY (source_id) REFERENCES ranking_sources(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ranking_snapshots_source_date_idx ON ranking_snapshots(source_id, ranking_date DESC);

CREATE TABLE IF NOT EXISTS backup_policies (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  work_id TEXT,
  target_type TEXT NOT NULL CHECK (target_type IN ('r2','webdav','s3-compatible')),
  enabled INTEGER NOT NULL DEFAULT 0,
  interval_minutes INTEGER NOT NULL CHECK (interval_minutes BETWEEN 5 AND 43200),
  retention_hours INTEGER NOT NULL CHECK (retention_hours BETWEEN 1 AND 8760),
  target_config_encrypted TEXT NOT NULL,
  last_backup_at TEXT,
  next_backup_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS backup_policies_due_idx ON backup_policies(enabled, next_backup_at);

CREATE TABLE IF NOT EXISTS backup_objects (
  id TEXT PRIMARY KEY,
  policy_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  work_id TEXT,
  target_type TEXT NOT NULL,
  object_key TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  deleted_at TEXT,
  delete_error TEXT,
  FOREIGN KEY (policy_id) REFERENCES backup_policies(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS backup_objects_expiry_idx ON backup_objects(deleted_at, expires_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (actor_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs(created_at DESC);
