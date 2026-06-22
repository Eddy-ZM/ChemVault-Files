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
    "ALTER TABLE files ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'roles'))",
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

async function runIgnoringSqliteError(db: D1Database, sql: string, ignoredMessage: string): Promise<void> {
  try {
    await db.prepare(sql).run();
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes(ignoredMessage.toLowerCase())) return;
    throw error;
  }
}
