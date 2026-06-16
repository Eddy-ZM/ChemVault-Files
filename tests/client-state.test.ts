import { describe, expect, it } from "vitest";
import { filterFiles, formatBytes, reduceUploadQueue, sortFiles, summarizeFiles } from "../src/lib/chemvault-files/client-state";
import * as clientState from "../src/lib/chemvault-files/client-state";
import type { FileRecord, LibraryResponse } from "../src/lib/chemvault-files/types";

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

const failedFile: FileRecord = {
  ...file,
  id: "file_2",
  displayName: "failed_upload_package.zip",
  originalName: "failed_upload_package.zip",
  mimeType: "application/zip",
  sizeBytes: 3886942618,
  status: "failed",
  updatedAt: "2026-06-12T00:00:00.000Z",
  tags: [{ id: "tag_raw", name: "Raw Data", slug: "raw-data", color: null, createdAt: "2026-06-11T00:00:00.000Z" }],
};

const csvFile: FileRecord = {
  ...file,
  id: "file_3",
  displayName: "kinetics_run_042_processed.csv",
  originalName: "kinetics_run_042_processed.csv",
  mimeType: "text/csv",
  sizeBytes: 47919923,
  updatedAt: "2026-06-10T00:00:00.000Z",
  tags: [{ id: "tag_kinetics", name: "Kinetics", slug: "kinetics", color: null, createdAt: "2026-06-11T00:00:00.000Z" }],
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

  it("filters by quick file status", () => {
    expect(filterFiles([file, failedFile, csvFile], { search: "", tagSlug: null, projectId: null, folderId: null, quickFilter: "failed" })).toEqual([failedFile]);
    expect(filterFiles([file, failedFile, csvFile], { search: "", tagSlug: null, projectId: null, folderId: null, quickFilter: "large" })).toEqual([failedFile]);
  });

  it("sorts files by table columns", () => {
    expect(sortFiles([file, failedFile, csvFile], { key: "size", direction: "desc" }).map((entry) => entry.id)).toEqual(["file_2", "file_3", "file_1"]);
    expect(sortFiles([file, failedFile, csvFile], { key: "name", direction: "asc" }).map((entry) => entry.id)).toEqual(["file_1", "file_2", "file_3"]);
  });

  it("summarizes library storage and health", () => {
    expect(summarizeFiles([file, failedFile, csvFile])).toMatchObject({
      totalBytes: 3948077133,
      readyCount: 2,
      failedCount: 1,
      largeFileCount: 1,
      largestFile: failedFile,
      latestFile: failedFile,
    });
  });

  it("keeps production startup and empty remote libraries free of seed files", () => {
    const previewLibrary: LibraryResponse = {
      projects: [
        {
          id: "project_dossiers",
          name: "Dossiers",
          slug: "dossiers",
          description: null,
          sortOrder: 10,
          createdAt: "2026-06-11T00:00:00.000Z",
          updatedAt: "2026-06-11T00:00:00.000Z",
        },
      ],
      folders: [],
      tags: file.tags,
      files: [file, failedFile],
    };
    const remoteEmptyLibrary: LibraryResponse = { ...previewLibrary, files: [] };
    const helpers = clientState as typeof clientState & {
      createInitialLibrary?: (seedLibrary: LibraryResponse) => LibraryResponse;
      resolveLibraryDisplay?: (input: {
        remoteLibrary: LibraryResponse;
        seedLibrary: LibraryResponse;
        environment: string;
        hostname?: string;
      }) => { library: LibraryResponse; previewMode: boolean };
    };

    expect(helpers.createInitialLibrary).toBeTypeOf("function");
    expect(helpers.resolveLibraryDisplay).toBeTypeOf("function");
    if (!helpers.createInitialLibrary || !helpers.resolveLibraryDisplay) return;

    expect(helpers.createInitialLibrary(previewLibrary)).toMatchObject({
      projects: previewLibrary.projects,
      folders: previewLibrary.folders,
      tags: [],
      files: [],
    });

    const productionDisplay = helpers.resolveLibraryDisplay({
      remoteLibrary: remoteEmptyLibrary,
      seedLibrary: previewLibrary,
      environment: "production",
    });
    expect(productionDisplay).toMatchObject({
      previewMode: false,
      library: { files: [] },
    });

    const productionHostDisplay = helpers.resolveLibraryDisplay({
      remoteLibrary: remoteEmptyLibrary,
      seedLibrary: previewLibrary,
      environment: "local",
      hostname: "file.chemvault.science",
    });
    expect(productionHostDisplay).toMatchObject({
      previewMode: false,
      library: { files: [] },
    });

    const localDisplay = helpers.resolveLibraryDisplay({
      remoteLibrary: remoteEmptyLibrary,
      seedLibrary: previewLibrary,
      environment: "local",
      hostname: "localhost",
    });
    expect(localDisplay).toMatchObject({
      previewMode: true,
      library: { files: previewLibrary.files },
    });
  });

  it("updates upload queue progress", () => {
    const queue = reduceUploadQueue([], { type: "add", id: "local_1", name: "raw.zip", sizeBytes: 100 });
    const progressed = reduceUploadQueue(queue, { type: "progress", id: "local_1", loadedBytes: 60 });
    expect(progressed[0]).toMatchObject({ progress: 60, status: "uploading" });
  });
});
