import type { Env } from "./env";
import { defaultRolePolicies } from "./permissions";

export async function ensureFileAccessSchema(db: D1Database, env: Pick<Env, "PRIVATE_OWNER_EMAIL">): Promise<void> {
  await db
    .prepare(
      "CREATE TABLE IF NOT EXISTS file_roles (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, scope TEXT NOT NULL CHECK (scope IN ('owner', 'domain', 'external')), domain TEXT, permission TEXT NOT NULL CHECK (permission IN ('none', 'read', 'write')), is_default INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"
    )
    .run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_file_roles_scope_domain ON file_roles(scope, domain)").run();

  const roles = defaultRolePolicies(env);
  for (const [index, role] of roles.entries()) {
    await db
      .prepare(
        "INSERT OR IGNORE INTO file_roles (id, name, description, scope, domain, permission, is_default, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(role.id, role.name, role.description, role.scope, role.domain, role.permission, role.isDefault ? 1 : 0, (index + 1) * 10, role.createdAt, role.updatedAt)
      .run();
  }

  await runIgnoringSqliteError(
    db,
    "ALTER TABLE files ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public', 'roles'))",
    "duplicate column name: visibility"
  );
  await db
    .prepare(
      "CREATE TABLE IF NOT EXISTS file_role_access (file_id TEXT NOT NULL, role_id TEXT NOT NULL, PRIMARY KEY (file_id, role_id), FOREIGN KEY (file_id) REFERENCES files(id), FOREIGN KEY (role_id) REFERENCES file_roles(id))"
    )
    .run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_files_visibility ON files(visibility)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_file_role_access_role ON file_role_access(role_id, file_id)").run();
}

export async function ensureFileSharesSchema(db: D1Database): Promise<void> {
  await runIgnoringSqliteError(
    db,
    "ALTER TABLE file_shares ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0",
    "duplicate column name: is_public"
  );
}

export async function ensureDriveAppSchema(db: D1Database): Promise<void> {
  const fileColumns = [
    "ALTER TABLE files ADD COLUMN owner_user_id TEXT",
    "ALTER TABLE files ADD COLUMN parent_id TEXT",
    "ALTER TABLE files ADD COLUMN item_type TEXT NOT NULL DEFAULT 'file' CHECK (item_type IN ('file'))",
    "ALTER TABLE files ADD COLUMN is_starred INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE files ADD COLUMN trashed_at TEXT",
    "ALTER TABLE files ADD COLUMN last_opened_at TEXT",
    "ALTER TABLE files ADD COLUMN shared_status TEXT NOT NULL DEFAULT 'private' CHECK (shared_status IN ('private', 'shared', 'public'))",
    "ALTER TABLE files ADD COLUMN metadata_json TEXT",
    "ALTER TABLE files ADD COLUMN scan_status TEXT NOT NULL DEFAULT 'clean'",
    "ALTER TABLE files ADD COLUMN scan_detail TEXT",
    "ALTER TABLE files ADD COLUMN scanned_at TEXT",
  ];
  const folderColumns = [
    "ALTER TABLE folders ADD COLUMN owner_user_id TEXT",
    "ALTER TABLE folders ADD COLUMN is_starred INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE folders ADD COLUMN is_trashed INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE folders ADD COLUMN trashed_at TEXT",
    "ALTER TABLE folders ADD COLUMN deleted_at TEXT",
    "ALTER TABLE folders ADD COLUMN metadata_json TEXT",
  ];

  for (const sql of [...fileColumns, ...folderColumns]) {
    await runIgnoringSqliteError(db, sql, "duplicate column name");
  }

  await db.prepare("CREATE INDEX IF NOT EXISTS idx_files_folder_deleted ON files(folder_id, deleted_at)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_files_actor_deleted ON files(actor_email, deleted_at)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_files_starred ON files(is_starred, updated_at)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_files_trashed ON files(deleted_at, trashed_at)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_files_last_opened ON files(last_opened_at)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_files_scan_status ON files(scan_status, updated_at)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_folders_parent_deleted ON folders(parent_id, deleted_at)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_folders_starred ON folders(is_starred, updated_at)").run();
}

async function runIgnoringSqliteError(db: D1Database, sql: string, ignoredMessage: string): Promise<void> {
  try {
    await db.prepare(sql).run();
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes(ignoredMessage.toLowerCase())) return;
    throw error;
  }
}
