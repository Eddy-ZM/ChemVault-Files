import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("migrations/0001_chemvault_files.sql", "utf8");

describe("D1 schema", () => {
  it("defines the approved metadata tables", () => {
    for (const tableName of ["projects", "folders", "files", "tags", "file_tags", "upload_sessions"]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${tableName}`);
    }
  });

  it("seeds the initial ChemVault project sections", () => {
    for (const projectName of ["Dossiers", "Methods", "Spectra", "Datasets", "Manuscripts"]) {
      expect(sql).toContain(`'${projectName}'`);
    }
  });
});
