PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS file_shares (
  token TEXT PRIMARY KEY,
  file_id TEXT NOT NULL,
  created_by_email TEXT,
  allow_download INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  access_count INTEGER NOT NULL DEFAULT 0,
  last_accessed_at TEXT,
  FOREIGN KEY (file_id) REFERENCES files(id)
);

CREATE TABLE IF NOT EXISTS file_activity (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL,
  actor_email TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('preview', 'download', 'share_created', 'share_accessed', 'share_download')),
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (file_id) REFERENCES files(id)
);

CREATE INDEX IF NOT EXISTS idx_file_shares_file ON file_shares(file_id);
CREATE INDEX IF NOT EXISTS idx_file_shares_expires_at ON file_shares(expires_at);
CREATE INDEX IF NOT EXISTS idx_file_activity_file_created ON file_activity(file_id, created_at DESC);
