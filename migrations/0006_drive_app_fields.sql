PRAGMA foreign_keys = ON;

ALTER TABLE files ADD COLUMN owner_user_id TEXT;
ALTER TABLE files ADD COLUMN parent_id TEXT;
ALTER TABLE files ADD COLUMN item_type TEXT NOT NULL DEFAULT 'file' CHECK (item_type IN ('file'));
ALTER TABLE files ADD COLUMN is_starred INTEGER NOT NULL DEFAULT 0;
ALTER TABLE files ADD COLUMN trashed_at TEXT;
ALTER TABLE files ADD COLUMN last_opened_at TEXT;
ALTER TABLE files ADD COLUMN shared_status TEXT NOT NULL DEFAULT 'private' CHECK (shared_status IN ('private', 'shared', 'public'));
ALTER TABLE files ADD COLUMN metadata_json TEXT;

ALTER TABLE folders ADD COLUMN owner_user_id TEXT;
ALTER TABLE folders ADD COLUMN is_starred INTEGER NOT NULL DEFAULT 0;
ALTER TABLE folders ADD COLUMN is_trashed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE folders ADD COLUMN trashed_at TEXT;
ALTER TABLE folders ADD COLUMN deleted_at TEXT;
ALTER TABLE folders ADD COLUMN metadata_json TEXT;

CREATE INDEX IF NOT EXISTS idx_files_folder_deleted ON files(folder_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_files_actor_deleted ON files(actor_email, deleted_at);
CREATE INDEX IF NOT EXISTS idx_files_starred ON files(is_starred, updated_at);
CREATE INDEX IF NOT EXISTS idx_files_trashed ON files(deleted_at, trashed_at);
CREATE INDEX IF NOT EXISTS idx_files_last_opened ON files(last_opened_at);
CREATE INDEX IF NOT EXISTS idx_folders_parent_deleted ON folders(parent_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_folders_starred ON folders(is_starred, updated_at);
