PRAGMA foreign_keys = ON;

-- Deliberately additive: legacy users, sessions, work_members, and
-- cloud_documents remain readable until a separately approved cleanup.
CREATE TABLE IF NOT EXISTS platform_accounts (
  id TEXT PRIMARY KEY,
  account_identifier TEXT NOT NULL UNIQUE COLLATE NOCASE,
  platform_role TEXT NOT NULL CHECK(platform_role IN ('OWNER','WRITER')),
  password_algorithm TEXT NOT NULL,
  password_iterations INTEGER NOT NULL,
  password_salt BLOB NOT NULL,
  password_digest BLOB NOT NULL,
  -- Exactly one row can reserve the owner slot.  A timestamp alone is not a
  -- singleton constraint, because two different timestamps would both be
  -- unique.
  owner_slot INTEGER CHECK(owner_slot IS NULL OR owner_slot = 1),
  owner_initialized_at TEXT,
  legacy_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS platform_accounts_owner_once_idx ON platform_accounts(owner_slot) WHERE owner_slot = 1;

CREATE TABLE IF NOT EXISTS platform_sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES platform_accounts(id),
  csrf_state TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  absolute_expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS platform_sessions_user_expiry_idx ON platform_sessions(user_id, expires_at);

CREATE TABLE IF NOT EXISTS auth_rate_limit_buckets (
  bucket_key TEXT PRIMARY KEY,
  window_started_at TEXT NOT NULL,
  attempt_count INTEGER NOT NULL,
  blocked_until TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_local_draft_keys (
  user_id TEXT PRIMARY KEY REFERENCES platform_accounts(id),
  wrapped_dek BLOB NOT NULL,
  wrap_iv BLOB NOT NULL,
  kek_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS works (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES platform_accounts(id),
  title TEXT NOT NULL,
  alternative_title TEXT,
  pen_name TEXT,
  logline TEXT,
  synopsis TEXT,
  audience TEXT,
  target_platform TEXT,
  primary_genre TEXT,
  secondary_genre TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  expected_word_count INTEGER,
  update_plan TEXT,
  status TEXT NOT NULL,
  copyright_note TEXT,
  ai_full_text_allowed INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  deleted_by TEXT REFERENCES platform_accounts(id),
  delete_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS works_owner_deleted_idx ON works(owner_id, deleted_at);

CREATE TABLE IF NOT EXISTS work_access (
  work_id TEXT NOT NULL REFERENCES works(id),
  user_id TEXT NOT NULL REFERENCES platform_accounts(id),
  role TEXT NOT NULL CHECK(role IN ('EDITOR','COMMENTER','VIEWER')),
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  PRIMARY KEY(work_id, user_id)
);
CREATE INDEX IF NOT EXISTS work_access_user_idx ON work_access(user_id, work_id);

CREATE TABLE IF NOT EXISTS platform_invitations (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  account_identifier TEXT NOT NULL COLLATE NOCASE,
  expires_at TEXT NOT NULL,
  max_uses INTEGER NOT NULL DEFAULT 1,
  use_count INTEGER NOT NULL DEFAULT 0,
  revoked_at TEXT,
  created_by TEXT NOT NULL REFERENCES platform_accounts(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS volumes (
  id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL REFERENCES works(id),
  title TEXT NOT NULL,
  position INTEGER NOT NULL,
  collapsed INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  deleted_by TEXT REFERENCES platform_accounts(id),
  delete_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL REFERENCES works(id),
  volume_id TEXT NOT NULL REFERENCES volumes(id),
  title TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  canonical_content TEXT NOT NULL,
  plain_text TEXT NOT NULL,
  legacy_html TEXT,
  legacy_content_hash TEXT,
  word_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  position INTEGER NOT NULL,
  target_word_count INTEGER,
  plot_goal TEXT,
  locked INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  deleted_by TEXT REFERENCES platform_accounts(id),
  delete_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS chapters_work_volume_position_idx ON chapters(work_id, volume_id, position);

CREATE TABLE IF NOT EXISTS chapter_versions (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL REFERENCES chapters(id),
  schema_version INTEGER NOT NULL DEFAULT 1,
  canonical_content TEXT NOT NULL,
  plain_text TEXT NOT NULL,
  legacy_html TEXT,
  word_count INTEGER NOT NULL,
  source_revision INTEGER NOT NULL,
  reason TEXT NOT NULL,
  label TEXT,
  created_by TEXT REFERENCES platform_accounts(id),
  is_favorite INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS chapter_versions_chapter_created_idx ON chapter_versions(chapter_id, created_at DESC);

CREATE TABLE IF NOT EXISTS chapter_conflicts (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL REFERENCES chapters(id),
  current_version_id TEXT NOT NULL REFERENCES chapter_versions(id),
  submitted_version_id TEXT NOT NULL REFERENCES chapter_versions(id),
  conflict_version_id TEXT NOT NULL REFERENCES chapter_versions(id),
  status TEXT NOT NULL CHECK(status IN ('OPEN','RESOLVED','DISMISSED')),
  resolved_by TEXT REFERENCES platform_accounts(id),
  resolved_at TEXT,
  created_at TEXT NOT NULL
);

-- Private notes, collaborative comments, and suggestions have distinct
-- tables so their authorization cannot be conflated.
CREATE TABLE IF NOT EXISTS chapter_notes (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL REFERENCES chapters(id),
  author_id TEXT NOT NULL REFERENCES platform_accounts(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chapter_comments_v2 (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL REFERENCES chapters(id),
  author_id TEXT NOT NULL REFERENCES platform_accounts(id),
  anchor_json TEXT,
  body TEXT NOT NULL,
  thread_status TEXT NOT NULL CHECK(thread_status IN ('OPEN','RESOLVED','DELETED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS change_suggestions (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL REFERENCES chapters(id),
  author_id TEXT NOT NULL REFERENCES platform_accounts(id),
  anchor_json TEXT NOT NULL,
  replacement_content TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('OPEN','ACCEPTED','REJECTED','SUPERSEDED')),
  handled_by TEXT REFERENCES platform_accounts(id),
  handled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS work_invitations (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  work_id TEXT NOT NULL REFERENCES works(id),
  role TEXT NOT NULL CHECK(role IN ('EDITOR','COMMENTER','VIEWER')),
  account_identifier TEXT NOT NULL COLLATE NOCASE,
  expires_at TEXT NOT NULL,
  max_uses INTEGER NOT NULL DEFAULT 1,
  use_count INTEGER NOT NULL DEFAULT 0,
  revoked_at TEXT,
  created_by TEXT NOT NULL REFERENCES platform_accounts(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS writing_sessions (
  user_id TEXT NOT NULL REFERENCES platform_accounts(id),
  date TEXT NOT NULL,
  added_characters INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id, date)
);
CREATE TABLE IF NOT EXISTS writing_goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES platform_accounts(id),
  work_id TEXT REFERENCES works(id),
  week_start TEXT NOT NULL,
  target_characters INTEGER NOT NULL,
  completed_characters INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_operations (
  client_operation_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES platform_accounts(id),
  chapter_id TEXT NOT NULL REFERENCES chapters(id),
  request_digest TEXT,
  result_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS migration_runs (
  migration_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES platform_accounts(id),
  source_database TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PREVIEW','RUNNING','COMPLETED','PARTIAL','FAILED','ROLLED_BACK')),
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS migration_work_items (
  migration_id TEXT NOT NULL REFERENCES migration_runs(migration_id),
  legacy_work_id TEXT NOT NULL,
  target_work_id TEXT,
  source_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PREVIEW','MIGRATED','FAILED','ROLLED_BACK','CONFLICT')),
  error_code TEXT,
  PRIMARY KEY(migration_id, legacy_work_id)
);

CREATE TABLE IF NOT EXISTS profile_settings (
  user_id TEXT PRIMARY KEY REFERENCES platform_accounts(id),
  theme TEXT NOT NULL,
  font_size INTEGER NOT NULL,
  line_height REAL NOT NULL,
  editor_width TEXT NOT NULL,
  left_column_width INTEGER NOT NULL,
  right_column_width INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS platform_audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES platform_accounts(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
