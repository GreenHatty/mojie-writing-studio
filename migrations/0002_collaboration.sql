ALTER TABLE change_suggestions ADD COLUMN base_revision INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS chapter_comments_chapter_created_idx ON chapter_comments(chapter_id, created_at);
CREATE INDEX IF NOT EXISTS change_suggestions_chapter_created_idx ON change_suggestions(chapter_id, created_at);
