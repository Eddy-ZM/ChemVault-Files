import { describe, expect, it } from "vitest";
import {
  buildInlinePreviewHeaders,
  buildDownloadHeaders,
  coercePatchPayload,
  coerceShareCreatePayload,
  createActivityDraft,
  createFileInitDraft,
  createShareToken,
  isShareInactive,
  recordFileActivity,
} from "../functions/_lib/file-service";
import { resolvePreviewKind } from "../src/lib/chemvault-files/preview";

describe("file service", () => {
  it("creates a direct upload draft with server generated ids and keys", () => {
    const draft = createFileInitDraft({
      payload: {
        name: "Compound_14_1H.jdx",
        size: 13214592,
        mimeType: "chemical/x-jcamp-dx",
        projectId: "project_spectra",
        folderId: "folder_spectra",
        tags: ["NMR"],
        visibility: "roles",
        roleIds: ["role_internal", "role_external"],
      },
      projectSlug: "2024-q2-catalysis-program",
      actorEmail: "owner@chemvault.science",
      now: new Date("2026-06-11T12:30:00.000Z"),
      idFactory: () => "file_abc123",
      sessionIdFactory: () => "upload_def456",
    });

    expect(draft.file.id).toBe("file_abc123");
    expect(draft.file.r2Key).toBe("files/2024-q2-catalysis-program/2026/06/file_abc123/Compound_14_1H.jdx");
    expect(draft.file.status).toBe("pending");
    expect(draft.file.visibility).toBe("roles");
    expect(draft.file.roleIds).toEqual(["role_internal", "role_external"]);
    expect(draft.session.mode).toBe("direct");
    expect(draft.session.status).toBe("created");
  });

  it("builds safe download headers", () => {
    const headers = buildDownloadHeaders({
      displayName: "Compound 14 1H.jdx",
      mimeType: "chemical/x-jcamp-dx",
      sizeBytes: 13214592,
    });

    expect(headers.get("content-type")).toBe("chemical/x-jcamp-dx");
    expect(headers.get("content-length")).toBe("13214592");
    expect(headers.get("content-disposition")).toContain('filename="Compound 14 1H.jdx"');
  });

  it("builds safe inline preview headers", () => {
    const headers = buildInlinePreviewHeaders({
      displayName: "Compound 14 report.pdf",
      mimeType: "application/pdf",
      sizeBytes: 4096,
    });

    expect(headers.get("content-type")).toBe("application/pdf");
    expect(headers.get("content-length")).toBe("4096");
    expect(headers.get("content-disposition")).toContain('inline; filename="Compound 14 report.pdf"');
    expect(headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("detects previewable file types without treating archives as inline content", () => {
    expect(resolvePreviewKind({ displayName: "report.pdf", mimeType: "application/pdf" })).toBe("pdf");
    expect(resolvePreviewKind({ displayName: "image.png", mimeType: "image/png" })).toBe("image");
    expect(resolvePreviewKind({ displayName: "kinetics.csv", mimeType: "text/csv" })).toBe("csv");
    expect(resolvePreviewKind({ displayName: "Compound_14_1H.jdx", mimeType: "chemical/x-jcamp-dx" })).toBe("text");
    expect(resolvePreviewKind({ displayName: "raw.zip", mimeType: "application/zip" })).toBe("unsupported");
  });

  it("coerces patch payloads for rename, move, and tags", () => {
    expect(coercePatchPayload({
      displayName: "../Report.pdf",
      projectId: "project_manuscripts",
      folderId: "",
      tags: ["PDF", "SI", "PDF"],
    })).toEqual({
      displayName: "Report.pdf",
      projectId: "project_manuscripts",
      folderId: null,
      tags: ["PDF", "SI"],
    });
  });

  it("coerces share creation payloads with bounded expirations", () => {
    const now = new Date("2026-06-17T08:00:00.000Z");

    expect(coerceShareCreatePayload({ expiresInDays: 30, allowDownload: true }, now)).toEqual({
      allowDownload: true,
      isPublic: false,
      expiresAt: "2026-07-17T08:00:00.000Z",
      expiresInDays: 30,
    });

    expect(coerceShareCreatePayload({ expiresInDays: 365, allowDownload: false }, now)).toEqual({
      allowDownload: false,
      isPublic: false,
      expiresAt: "2026-06-24T08:00:00.000Z",
      expiresInDays: 7,
    });

    expect(coerceShareCreatePayload({ expiresInDays: 7, allowDownload: true, isPublic: true }, now)).toEqual({
      allowDownload: true,
      isPublic: true,
      expiresAt: "2026-06-24T08:00:00.000Z",
      expiresInDays: 7,
    });

    expect(coerceShareCreatePayload({ expiresAt: "2026-06-20T10:15:00.000Z", allowDownload: true }, now)).toEqual({
      allowDownload: true,
      isPublic: false,
      expiresAt: "2026-06-20T10:15:00.000Z",
      expiresInDays: null,
    });

    expect(() => coerceShareCreatePayload({ expiresAt: "2026-06-17T07:59:00.000Z" }, now)).toThrow("future");
    expect(() => coerceShareCreatePayload({ expiresAt: "not-a-date" }, now)).toThrow("invalid");
    expect(() => coerceShareCreatePayload({ expiresAt: "2027-07-01T08:00:00.000Z" }, now)).toThrow("365 days");
  });

  it("creates opaque share tokens", () => {
    expect(createShareToken(() => "123e4567-e89b-12d3-a456-426614174000")).toBe("sh_123e4567e89b12d3a456426614174000");
  });

  it("treats expired or revoked shares as inactive", () => {
    const now = new Date("2026-06-17T08:00:00.000Z");

    expect(isShareInactive({ expiresAt: "2026-06-17T07:59:59.000Z", revokedAt: null }, now)).toBe(true);
    expect(isShareInactive({ expiresAt: "2026-06-18T08:00:00.000Z", revokedAt: "2026-06-17T08:00:00.000Z" }, now)).toBe(true);
    expect(isShareInactive({ expiresAt: "2026-06-18T08:00:00.000Z", revokedAt: null }, now)).toBe(false);
  });

  it("creates activity drafts with stable metadata JSON", () => {
    const draft = createActivityDraft({
      fileId: "file_1",
      actorEmail: "scientist@chemvault.science",
      eventType: "share_created",
      metadata: { allowDownload: false, token: "sh_123" },
      now: new Date("2026-06-17T08:00:00.000Z"),
      idFactory: () => "activity_1",
    });

    expect(draft).toEqual({
      id: "activity_1",
      fileId: "file_1",
      actorEmail: "scientist@chemvault.science",
      eventType: "share_created",
      metadataJson: "{\"allowDownload\":false,\"token\":\"sh_123\"}",
      createdAt: "2026-06-17T08:00:00.000Z",
    });
  });

  it("does not fail the file action when the optional activity table is not migrated yet", async () => {
    const db = {
      prepare: () => ({
        bind: () => ({
          run: async () => {
            throw new Error("D1_ERROR: no such table: file_activity: SQLITE_ERROR");
          },
        }),
      }),
    } as unknown as D1Database;

    await expect(
      recordFileActivity(
        db,
        createActivityDraft({
          fileId: "file_1",
          eventType: "preview",
          idFactory: () => "activity_1",
        })
      )
    ).resolves.toBeUndefined();
  });
});
