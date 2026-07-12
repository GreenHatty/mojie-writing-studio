PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS site_settings (
  setting_key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS chapter_comments (
  id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL,
  chapter_id TEXT NOT NULL,
  paragraph_key TEXT,
  anchor_from INTEGER NOT NULL DEFAULT 0,
  anchor_to INTEGER NOT NULL DEFAULT 0,
  quoted_text TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','deleted')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS chapter_comments_work_chapter_idx ON chapter_comments(work_id, chapter_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS chapter_suggestions (
  id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL,
  chapter_id TEXT NOT NULL,
  paragraph_key TEXT,
  anchor_from INTEGER NOT NULL DEFAULT 0,
  anchor_to INTEGER NOT NULL DEFAULT 0,
  original_text TEXT NOT NULL,
  replacement_text TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','rejected','superseded')),
  created_by TEXT NOT NULL,
  resolved_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (resolved_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS chapter_suggestions_work_chapter_idx ON chapter_suggestions(work_id, chapter_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS publication_records (
  id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL,
  chapter_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  platform_chapter_id TEXT,
  published_at TEXT NOT NULL,
  recorded_by TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (recorded_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS publication_records_work_chapter_idx ON publication_records(work_id, chapter_id, published_at DESC);

INSERT OR IGNORE INTO site_settings(setting_key,value_json,updated_by,updated_at)
VALUES('site_profile','{"siteName":"墨界·私人网文创作台","defaultInviteHours":72,"recycleRetentionDays":30}',NULL,datetime('now'));
