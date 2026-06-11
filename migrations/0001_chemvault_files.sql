PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  parent_id TEXT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (parent_id) REFERENCES folders(id)
);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  folder_id TEXT,
  display_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  mime_type TEXT,
  size_bytes INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'uploading', 'ready', 'failed', 'deleted')),
  checksum TEXT,
  upload_session_id TEXT,
  actor_email TEXT,
  download_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (folder_id) REFERENCES folders(id)
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  color TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS file_tags (
  file_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (file_id, tag_id),
  FOREIGN KEY (file_id) REFERENCES files(id),
  FOREIGN KEY (tag_id) REFERENCES tags(id)
);

CREATE TABLE IF NOT EXISTS upload_sessions (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('direct', 'presigned', 'multipart')),
  status TEXT NOT NULL CHECK (status IN ('created', 'uploading', 'complete', 'aborted', 'failed')),
  part_size_bytes INTEGER,
  part_count INTEGER,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (file_id) REFERENCES files(id)
);

CREATE INDEX IF NOT EXISTS idx_files_status ON files(status);
CREATE INDEX IF NOT EXISTS idx_files_project_folder ON files(project_id, folder_id);
CREATE INDEX IF NOT EXISTS idx_files_updated_at ON files(updated_at);
CREATE INDEX IF NOT EXISTS idx_folders_project ON folders(project_id);
CREATE INDEX IF NOT EXISTS idx_file_tags_tag ON file_tags(tag_id);

INSERT OR IGNORE INTO projects (id, name, slug, description, sort_order, created_at, updated_at) VALUES
  ('project_dossiers', 'Dossiers', 'dossiers', 'Project-style research files and evidence bundles.', 10, '2026-06-11T00:00:00.000Z', '2026-06-11T00:00:00.000Z'),
  ('project_methods', 'Methods', 'methods', 'Protocols, reproducibility notes, and method documentation.', 20, '2026-06-11T00:00:00.000Z', '2026-06-11T00:00:00.000Z'),
  ('project_spectra', 'Spectra', 'spectra', 'NMR, IR, MS, and raw instrument exports.', 30, '2026-06-11T00:00:00.000Z', '2026-06-11T00:00:00.000Z'),
  ('project_datasets', 'Datasets', 'datasets', 'CSV, HDF5, archives, and processed research datasets.', 40, '2026-06-11T00:00:00.000Z', '2026-06-11T00:00:00.000Z'),
  ('project_manuscripts', 'Manuscripts', 'manuscripts', 'Drafts, reports, supplementary information, and figures.', 50, '2026-06-11T00:00:00.000Z', '2026-06-11T00:00:00.000Z');

INSERT OR IGNORE INTO folders (id, project_id, parent_id, name, slug, path, created_at, updated_at) VALUES
  ('folder_spectra', 'project_spectra', NULL, 'Spectra', 'spectra', '/Spectra', '2026-06-11T00:00:00.000Z', '2026-06-11T00:00:00.000Z'),
  ('folder_datasets', 'project_datasets', NULL, 'Datasets', 'datasets', '/Datasets', '2026-06-11T00:00:00.000Z', '2026-06-11T00:00:00.000Z');

INSERT OR IGNORE INTO tags (id, name, slug, color, created_at) VALUES
  ('tag_nmr', 'NMR', 'nmr', '#0071e3', '2026-06-11T00:00:00.000Z'),
  ('tag_raw_data', 'Raw Data', 'raw-data', '#1d7f42', '2026-06-11T00:00:00.000Z'),
  ('tag_pdf', 'PDF', 'pdf', '#d70015', '2026-06-11T00:00:00.000Z');
