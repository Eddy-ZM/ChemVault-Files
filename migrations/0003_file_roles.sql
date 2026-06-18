PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS file_roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  scope TEXT NOT NULL CHECK (scope IN ('owner', 'domain', 'external')),
  domain TEXT,
  permission TEXT NOT NULL CHECK (permission IN ('none', 'read', 'write')),
  is_default INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_file_roles_scope_domain ON file_roles(scope, domain);

INSERT OR IGNORE INTO file_roles (id, name, description, scope, domain, permission, is_default, sort_order, created_at, updated_at) VALUES
  ('role_super', 'Super', 'Owner role with full file access.', 'owner', NULL, 'write', 0, 10, '2026-06-18T00:00:00.000Z', '2026-06-18T00:00:00.000Z'),
  ('role_internal', 'Common_In', 'Cloudflare Access users from the ChemVault domain.', 'domain', 'chemvault.science', 'read', 0, 20, '2026-06-18T00:00:00.000Z', '2026-06-18T00:00:00.000Z'),
  ('role_external', 'Common_Out', 'External Cloudflare Access users.', 'external', NULL, 'read', 1, 30, '2026-06-18T00:00:00.000Z', '2026-06-18T00:00:00.000Z');
