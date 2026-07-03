PRAGMA foreign_keys = ON;

ALTER TABLE files ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public', 'roles'));

CREATE TABLE IF NOT EXISTS file_role_access (
  file_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  PRIMARY KEY (file_id, role_id),
  FOREIGN KEY (file_id) REFERENCES files(id),
  FOREIGN KEY (role_id) REFERENCES file_roles(id)
);

CREATE INDEX IF NOT EXISTS idx_files_visibility ON files(visibility);
CREATE INDEX IF NOT EXISTS idx_file_role_access_role ON file_role_access(role_id, file_id);

UPDATE file_roles SET permission = 'write', updated_at = '2026-06-18T00:00:00.000Z' WHERE id = 'role_internal';
UPDATE file_roles SET permission = 'read', updated_at = '2026-06-18T00:00:00.000Z' WHERE id = 'role_external';
