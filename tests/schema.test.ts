import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

const sql = readdirSync("migrations")
  .filter((fileName) => fileName.endsWith(".sql"))
  .sort()
  .map((fileName) => readFileSync(`migrations/${fileName}`, "utf8"))
  .join("\n");

describe("D1 schema", () => {
  it("defines the approved metadata tables", () => {
    for (const tableName of ["projects", "folders", "files", "tags", "file_tags", "upload_sessions", "file_shares", "file_activity", "file_roles"]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${tableName}`);
    }
  });

  it("indexes share and activity lookups", () => {
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_file_shares_file");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_file_shares_expires_at");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_file_activity_file_created");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_file_roles_scope_domain");
  });

  it("seeds the initial ChemVault project sections", () => {
    for (const projectName of ["Dossiers", "Methods", "Spectra", "Datasets", "Manuscripts"]) {
      expect(sql).toContain(`'${projectName}'`);
    }
  });
});
