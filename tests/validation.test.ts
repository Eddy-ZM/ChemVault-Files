import { describe, expect, it } from "vitest";
import {
  MAX_UPLOAD_FILE_SIZE_BYTES,
  assertFileInitPayload,
  normalizeSlug,
  sanitizeVisibleName,
} from "../src/lib/chemvault-files/validation";

describe("ChemVault Files validation", () => {
  it("normalizes names into stable slugs", () => {
    expect(normalizeSlug("  2024 Q2 Catalysis Program  ")).toBe("2024-q2-catalysis-program");
    expect(normalizeSlug("NMR / Raw Data + CDCl3")).toBe("nmr-raw-data-cdcl3");
  });

  it("preserves readable filenames while removing unsafe path characters", () => {
    expect(sanitizeVisibleName("../Compound 14/1H.jdx")).toBe("Compound 14_1H.jdx");
    expect(sanitizeVisibleName("   ")).toBe("untitled-file");
  });

  it("accepts a valid file init payload", () => {
    const payload = assertFileInitPayload({
      name: "Compound_14_1H.jdx",
      size: 13214592,
      mimeType: "chemical/x-jcamp-dx",
      projectId: "project_spectra",
      folderId: "folder_spectra",
      tags: ["NMR", "1H", "CDCl3"],
    });

    expect(payload.name).toBe("Compound_14_1H.jdx");
    expect(payload.tags).toEqual(["NMR", "1H", "CDCl3"]);
    expect(payload.visibility).toBe("private");
    expect(payload.roleIds).toEqual([]);
  });

  it("keeps uploads private by default unless a supported visibility is explicit", () => {
    expect(assertFileInitPayload({ name: "report.pdf", size: 10, mimeType: "application/pdf", projectId: "p" }).visibility).toBe("private");
    expect(assertFileInitPayload({ name: "report.pdf", size: 10, mimeType: "application/pdf", projectId: "p", visibility: "private" }).visibility).toBe("private");
    expect(assertFileInitPayload({ name: "report.pdf", size: 10, mimeType: "application/pdf", projectId: "p", visibility: "public" }).visibility).toBe("public");
    expect(assertFileInitPayload({ name: "report.pdf", size: 10, mimeType: "application/pdf", projectId: "p", visibility: "unexpected" }).visibility).toBe("private");
  });

  it("rejects invalid file init payloads with clear messages", () => {
    expect(() => assertFileInitPayload({ name: "", size: 1, projectId: "p" })).toThrow("File name is required");
    expect(() => assertFileInitPayload({ name: "a.pdf", size: 0, projectId: "p" })).toThrow("File size must be greater than zero");
    expect(() => assertFileInitPayload({ name: "a.pdf", size: 1 })).toThrow("Project is required");
  });

  it("rejects blocked or oversized uploads before storage", () => {
    expect(() => assertFileInitPayload({ name: "archive.zip", size: 10, mimeType: "application/zip", projectId: "p" })).toThrow(
      "File type is not allowed for upload"
    );
    expect(() => assertFileInitPayload({ name: "script.js", size: 10, mimeType: "text/javascript", projectId: "p" })).toThrow(
      "File type is not allowed for upload"
    );
    expect(() => assertFileInitPayload({ name: "large.pdf", size: MAX_UPLOAD_FILE_SIZE_BYTES + 1, mimeType: "application/pdf", projectId: "p" })).toThrow(
      "File is larger than the 100 MB upload limit"
    );
  });
});
