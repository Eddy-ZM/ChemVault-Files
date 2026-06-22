import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { ensureFileSharesSchema } from "../functions/_lib/schema";

const sql = readdirSync("migrations")
  .filter((fileName) => fileName.endsWith(".sql"))
  .sort()
  .map((fileName) => readFileSync(`migrations/${fileName}`, "utf8"))
  .join("\n");

describe("D1 schema", () => {
  it("defines the approved metadata tables", () => {
    for (const tableName of [
      "projects",
      "folders",
      "files",
      "tags",
      "file_tags",
      "upload_sessions",
      "file_shares",
      "file_activity",
      "file_roles",
      "file_role_access",
    ]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${tableName}`);
    }
  });

  it("indexes share and activity lookups", () => {
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_file_shares_file");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_file_shares_expires_at");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_file_activity_file_created");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_file_roles_scope_domain");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_file_role_access_role");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_files_visibility");
  });

  it("seeds the initial ChemVault project sections", () => {
    for (const projectName of ["Dossiers", "Methods", "Spectra", "Datasets", "Manuscripts"]) {
      expect(sql).toContain(`'${projectName}'`);
    }
  });

  it("repairs older share tables with the public-link column", async () => {
    const statements: string[] = [];
    const db = {
      prepare: (statement: string) => ({
        run: async () => {
          statements.push(statement);
          return { success: true };
        },
      }),
    } as unknown as D1Database;

    await expect(ensureFileSharesSchema(db)).resolves.toBeUndefined();
    expect(statements).toContain("ALTER TABLE file_shares ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0");
  });

  it("ignores duplicate public-link column repairs", async () => {
    const db = {
      prepare: () => ({
        run: async () => {
          throw new Error("D1_ERROR: duplicate column name: is_public: SQLITE_ERROR");
        },
      }),
    } as unknown as D1Database;

    await expect(ensureFileSharesSchema(db)).resolves.toBeUndefined();
  });
});
