import { describe, expect, it } from "vitest";
import {
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
  });

  it("rejects invalid file init payloads with clear messages", () => {
    expect(() => assertFileInitPayload({ name: "", size: 1, projectId: "p" })).toThrow("File name is required");
    expect(() => assertFileInitPayload({ name: "a.pdf", size: 0, projectId: "p" })).toThrow("File size must be greater than zero");
    expect(() => assertFileInitPayload({ name: "a.pdf", size: 1 })).toThrow("Project is required");
  });
});
