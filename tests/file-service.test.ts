import { describe, expect, it } from "vitest";
import {
  buildDownloadHeaders,
  coercePatchPayload,
  createFileInitDraft,
} from "../functions/_lib/file-service";

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
});
