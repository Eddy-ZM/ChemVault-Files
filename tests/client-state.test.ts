import { describe, expect, it } from "vitest";
import { filterFiles, formatBytes, reduceUploadQueue } from "../src/lib/chemvault-files/client-state";
import type { FileRecord } from "../src/lib/chemvault-files/types";

const file: FileRecord = {
  id: "file_1",
  projectId: "project_spectra",
  folderId: "folder_spectra",
  displayName: "Compound_14_1H.jdx",
  originalName: "Compound_14_1H.jdx",
  r2Key: "files/spectra/2026/06/file_1/Compound_14_1H.jdx",
  mimeType: "chemical/x-jcamp-dx",
  sizeBytes: 13214592,
  status: "ready",
  checksum: null,
  uploadSessionId: null,
  actorEmail: "owner@chemvault.science",
  downloadCount: 0,
  createdAt: "2026-06-11T00:00:00.000Z",
  updatedAt: "2026-06-11T00:00:00.000Z",
  deletedAt: null,
  tags: [{ id: "tag_nmr", name: "NMR", slug: "nmr", color: "#0071e3", createdAt: "2026-06-11T00:00:00.000Z" }],
};

describe("client state", () => {
  it("formats bytes for file rows", () => {
    expect(formatBytes(13214592)).toBe("12.6 MB");
    expect(formatBytes(1288490188)).toBe("1.2 GB");
  });

  it("filters by search and tag", () => {
    expect(filterFiles([file], { search: "compound", tagSlug: "nmr", projectId: "project_spectra", folderId: null })).toHaveLength(1);
    expect(filterFiles([file], { search: "kinetics", tagSlug: "nmr", projectId: "project_spectra", folderId: null })).toHaveLength(0);
  });

  it("updates upload queue progress", () => {
    const queue = reduceUploadQueue([], { type: "add", id: "local_1", name: "raw.zip", sizeBytes: 100 });
    const progressed = reduceUploadQueue(queue, { type: "progress", id: "local_1", loadedBytes: 60 });
    expect(progressed[0]).toMatchObject({ progress: 60, status: "uploading" });
  });
});
