ALTER TABLE files ADD COLUMN scan_status TEXT NOT NULL DEFAULT 'clean';
ALTER TABLE files ADD COLUMN scan_detail TEXT;
ALTER TABLE files ADD COLUMN scanned_at TEXT;
CREATE INDEX IF NOT EXISTS idx_files_scan_status ON files(scan_status, updated_at);
