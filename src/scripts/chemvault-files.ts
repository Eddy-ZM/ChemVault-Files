import {
  filterFiles,
  formatBytes,
  reduceUploadQueue,
  type FileFilters,
  type UploadQueueItem,
} from "../lib/chemvault-files/client-state";
import type { FileRecord, FolderRecord, LibraryResponse, ProjectRecord, TagRecord } from "../lib/chemvault-files/types";

interface HealthResponse {
  status: "ready" | "configuration-missing";
  api: string;
  d1: "online" | "missing";
  r2: "online" | "missing";
  environment: string;
}

interface InitUploadResponse {
  file: FileRecord;
  session: { id: string };
  upload: {
    mode: "direct" | "presigned" | "multipart";
    method: string;
    url: string;
  };
}

const seedProjects = [
  project("project_dossiers", "Dossiers", "dossiers", 10),
  project("project_methods", "Methods", "methods", 20),
  project("project_spectra", "Spectra", "spectra", 30),
  project("project_datasets", "Datasets", "datasets", 40),
  project("project_manuscripts", "Manuscripts", "manuscripts", 50),
];

const seedFolders = [
  folder("folder_spectra", "project_spectra", "Spectra", "spectra", "/Spectra"),
  folder("folder_datasets", "project_datasets", "Datasets", "datasets", "/Datasets"),
];

const seedTags = [
  tag("tag_nmr", "NMR", "nmr", "#0071e3"),
  tag("tag_raw_data", "Raw Data", "raw-data", "#1d7f42"),
  tag("tag_pdf", "PDF", "pdf", "#d70015"),
  tag("tag_kinetics", "Kinetics", "kinetics", null),
  tag("tag_ir", "IR", "ir", null),
];

const seedLibrary: LibraryResponse = {
  projects: seedProjects,
  folders: seedFolders,
  tags: seedTags,
  files: [
    file("file_seed_1", "project_spectra", "folder_spectra", "2024-05-21_NMR_Compound_14.zip", "application/zip", 1331439861, ["NMR", "Raw Data"]),
    file("file_seed_2", "project_spectra", "folder_spectra", "Compound_14_1H.jdx", "chemical/x-jcamp-dx", 13214592, ["NMR"]),
    file("file_seed_3", "project_spectra", "folder_spectra", "Compound_14_13C.jdx", "chemical/x-jcamp-dx", 19188940, ["NMR"]),
    file("file_seed_4", "project_manuscripts", null, "NMR_Analysis_Report_Compound_14.pdf", "application/pdf", 1887436, ["PDF"]),
    file("file_seed_5", "project_datasets", "folder_datasets", "kinetics_run_042_processed.csv", "text/csv", 47919923, ["Kinetics", "Raw Data"]),
  ],
};

const seedUploadQueue: UploadQueueItem[] = [
  {
    id: "seed_upload_1",
    name: "2024-05-21_NMR_Compound_14.zip",
    sizeBytes: 1331439861,
    loadedBytes: 905379105,
    progress: 68,
    status: "uploading",
    message: "2m 18s left",
  },
  {
    id: "seed_upload_2",
    name: "kinetics_run_042_processed.csv",
    sizeBytes: 47919923,
    loadedBytes: 47919923,
    progress: 100,
    status: "complete",
    message: "Completed",
  },
];

let library: LibraryResponse = seedLibrary;
let filters: FileFilters = {
  search: "",
  projectId: null,
  folderId: null,
  tagSlug: null,
};
let selectedFileId: string | null = "file_seed_2";
let uploadQueue: UploadQueueItem[] = [];
let configurationMissing = false;

export function bootChemVaultFiles(): void {
  const shell = document.querySelector<HTMLElement>("[data-cv-shell]");
  if (!shell || shell.dataset.cvBooted === "true") return;

  shell.dataset.cvBooted = "true";
  bindEvents();
  renderAll();
  void loadRemoteState();
}

function project(id: string, name: string, slug: string, sortOrder: number): ProjectRecord {
  const timestamp = "2026-06-11T00:00:00.000Z";
  return { id, name, slug, description: null, sortOrder, createdAt: timestamp, updatedAt: timestamp };
}

function folder(id: string, projectId: string, name: string, slug: string, path: string): FolderRecord {
  const timestamp = "2026-06-11T00:00:00.000Z";
  return { id, projectId, parentId: null, name, slug, path, createdAt: timestamp, updatedAt: timestamp };
}

function tag(id: string, name: string, slug: string, color: string | null): TagRecord {
  return { id, name, slug, color, createdAt: "2026-06-11T00:00:00.000Z" };
}

function file(
  id: string,
  projectId: string,
  folderId: string | null,
  displayName: string,
  mimeType: string | null,
  sizeBytes: number,
  tagNames: string[]
): FileRecord {
  const timestamp = "2026-05-21T10:41:00.000Z";
  const tags = tagNames.map((name) => {
    const existing = seedTags.find((entry) => entry.name === name);
    return existing ?? tag(`tag_${slugify(name)}`, name, slugify(name), null);
  });
  return {
    id,
    projectId,
    folderId,
    displayName,
    originalName: displayName,
    r2Key: `seed/${id}/${displayName}`,
    mimeType,
    sizeBytes,
    status: "ready",
    checksum: null,
    uploadSessionId: null,
    actorEmail: "owner@chemvault.science",
    downloadCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    tags,
  };
}

function bindEvents(): void {
  document.querySelector<HTMLFormElement>("[data-cv-search-form]")?.addEventListener("submit", (event) => event.preventDefault());
  document.querySelector<HTMLInputElement>("[data-cv-search-input]")?.addEventListener("input", (event) => {
    filters = { ...filters, search: (event.currentTarget as HTMLInputElement).value };
    renderFiles();
  });

  const fileInput = document.querySelector<HTMLInputElement>("[data-cv-file-input]");
  document.querySelector<HTMLButtonElement>("[data-cv-upload-button]")?.addEventListener("click", () => fileInput?.click());
  fileInput?.addEventListener("change", () => {
    void handleFiles(fileInput.files);
    fileInput.value = "";
  });

  const dropzone = document.querySelector<HTMLElement>("[data-cv-file-dropzone]");
  dropzone?.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropzone.classList.add("is-dragover");
  });
  dropzone?.addEventListener("dragleave", () => dropzone.classList.remove("is-dragover"));
  dropzone?.addEventListener("drop", (event) => {
    event.preventDefault();
    dropzone.classList.remove("is-dragover");
    void handleFiles(event.dataTransfer?.files ?? null);
  });

  document.querySelector<HTMLElement>("[data-cv-folder-tree]")?.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-cv-project-id], [data-cv-folder-id]");
    if (!target) return;
    event.preventDefault();
    filters = {
      ...filters,
      projectId: target.dataset.cvProjectId || null,
      folderId: target.dataset.cvFolderId || null,
    };
    renderAll();
  });

  document.querySelector<HTMLElement>("[data-cv-tags]")?.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-cv-tag-slug]");
    if (!target) return;
    filters = {
      ...filters,
      tagSlug: filters.tagSlug === target.dataset.cvTagSlug ? null : target.dataset.cvTagSlug || null,
    };
    renderAll();
  });

  document.querySelector<HTMLElement>("[data-cv-active-filters]")?.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-cv-clear-filters]");
    if (!target) return;
    filters = { search: filters.search, projectId: null, folderId: null, tagSlug: null };
    renderAll();
  });

  document.querySelector<HTMLElement>("[data-cv-file-table-body]")?.addEventListener("click", (event) => {
    const row = (event.target as HTMLElement).closest<HTMLTableRowElement>("[data-cv-file-id]");
    if (!row) return;
    selectedFileId = row.dataset.cvFileId || null;
    renderFiles();
    renderInspector();
  });

  document.querySelector<HTMLButtonElement>("[data-cv-download-button]")?.addEventListener("click", () => {
    if (!selectedFileId) return;
    window.location.href = `/api/files/${encodeURIComponent(selectedFileId)}/download`;
  });

  document.querySelector<HTMLButtonElement>("[data-cv-delete-button]")?.addEventListener("click", () => {
    if (!selectedFileId) return;
    void deleteSelectedFile();
  });
}

async function loadRemoteState(): Promise<void> {
  try {
    const health = await fetchJson<HealthResponse>("/api/health");
    configurationMissing = health.status !== "ready";
    renderHealth(health);
  } catch {
    configurationMissing = true;
    renderHealth();
  }

  try {
    library = await fetchJson<LibraryResponse>("/api/library");
    configurationMissing = false;
    uploadQueue = [];
  } catch {
    configurationMissing = true;
    library = seedLibrary;
    uploadQueue = seedUploadQueue;
  }

  selectedFileId = pickSelectedFileId();
  renderAll();
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : null;
  if (!response.ok) {
    const message = readErrorMessage(payload) || `${response.status} ${response.statusText}`;
    throw new Error(message);
  }
  if (payload && typeof payload === "object" && "error" in payload) {
    throw new Error(readErrorMessage(payload) || "Request failed");
  }
  return payload as T;
}

function readErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const error = (payload as { error?: { message?: unknown } }).error;
  return typeof error?.message === "string" ? error.message : null;
}

function renderAll(): void {
  renderSidebar();
  renderQueue();
  renderFiles();
  renderInspector();
}

function renderHealth(health?: HealthResponse): void {
  const band = document.querySelector<HTMLElement>("[data-cv-status-band]");
  if (!band) return;

  const isReady = health?.status === "ready";
  const items = [
    { label: "Private Access", state: "online", icon: true },
    { label: health?.r2 === "online" ? "R2 online" : "R2 missing", state: health?.r2 === "online" ? "online" : "warning" },
    { label: health?.d1 === "online" ? "D1 index" : "D1 missing", state: health?.d1 === "online" ? "online" : "warning" },
    { label: isReady ? "Ready" : "Configuration missing", state: isReady ? "online" : "warning", end: true },
  ];

  band.innerHTML = items
    .map(
      (item) => `
        <div class="status-item${item.end ? " status-item--end" : ""}">
          ${item.icon ? lockIcon() : ""}
          <span class="status-dot ${item.state === "warning" ? "status-dot--warning" : ""}"></span>
          <span>${escapeHtml(item.label)}</span>
        </div>
      `
    )
    .join("");
}

function renderSidebar(): void {
  const folderTree = document.querySelector<HTMLElement>("[data-cv-folder-tree]");
  const tagsContainer = document.querySelector<HTMLElement>("[data-cv-tags]");
  if (folderTree) {
    folderTree.innerHTML = library.projects.map((projectRecord) => renderProject(projectRecord)).join("");
  }
  if (tagsContainer) {
    tagsContainer.innerHTML = library.tags.map((tagRecord) => renderTagButton(tagRecord)).join("");
  }
}

function renderProject(projectRecord: ProjectRecord): string {
  const projectFolders = library.folders.filter((entry) => entry.projectId === projectRecord.id);
  const count = library.files.filter((entry) => entry.projectId === projectRecord.id && entry.status !== "deleted").length;
  const isActive = filters.projectId === projectRecord.id && !filters.folderId;
  const children = projectFolders
    .map((folderRecord) => {
      const folderCount = library.files.filter((entry) => entry.folderId === folderRecord.id && entry.status !== "deleted").length;
      return `
        <li>
          <a class="folder-row folder-row--child${filters.folderId === folderRecord.id ? " is-active" : ""}" href="#" data-cv-project-id="${escapeAttr(projectRecord.id)}" data-cv-folder-id="${escapeAttr(folderRecord.id)}">
            ${chevronIcon("right")}
            ${folderIcon()}
            <span>${escapeHtml(folderRecord.name)}</span>
            <strong>${folderCount}</strong>
          </a>
        </li>
      `;
    })
    .join("");

  return `
    <li>
      <a class="folder-row${isActive ? " is-active" : ""}" href="#" data-cv-project-id="${escapeAttr(projectRecord.id)}">
        ${chevronIcon(children ? "down" : "right")}
        ${folderIcon()}
        <span>${escapeHtml(projectRecord.name)}</span>
        <strong>${count}</strong>
      </a>
      ${children ? `<ul>${children}</ul>` : ""}
    </li>
  `;
}

function renderTagButton(tagRecord: TagRecord): string {
  const count = library.files.filter((entry) => entry.tags.some((fileTag) => fileTag.slug === tagRecord.slug)).length;
  return `
    <button class="tag-pill${filters.tagSlug === tagRecord.slug ? " is-active" : ""}" type="button" data-cv-tag-slug="${escapeAttr(tagRecord.slug)}">
      <span>${escapeHtml(tagRecord.name)}</span>
      <strong>${count}</strong>
    </button>
  `;
}

function renderQueue(): void {
  const uploadTitle = document.querySelector<HTMLElement>("[data-cv-upload-title]");
  const uploadList = document.querySelector<HTMLElement>("[data-cv-upload-list]");
  if (uploadTitle) uploadTitle.textContent = uploadQueue.length ? `Upload Queue (${uploadQueue.length})` : "Upload Queue";
  if (!uploadList) return;

  if (uploadQueue.length === 0) {
    uploadList.innerHTML = `<li class="upload-row upload-row--empty">Ready for direct R2 upload. Drop files above to start.</li>`;
    return;
  }

  uploadList.innerHTML = uploadQueue
    .map((item) => {
      const ext = extensionForName(item.name);
      const isComplete = item.status === "complete";
      const isFailed = item.status === "failed";
      const statusText = isFailed ? item.message || "Failed" : isComplete ? "Completed" : item.status === "queued" ? "Queued" : `${item.progress}%`;
      return `
        <li class="upload-row${isFailed ? " is-failed" : ""}" data-cv-upload-row>
          <span class="file-type-icon" data-ext="${escapeAttr(ext)}">${escapeHtml(ext)}</span>
          <span class="upload-row__name">${escapeHtml(item.name)}</span>
          <span class="upload-row__size">${formatBytes(item.sizeBytes)}</span>
          ${
            isComplete
              ? `<span class="upload-complete">${checkIcon()} Completed</span>`
              : `<span class="progress" role="progressbar" aria-valuenow="${item.progress}" aria-valuemin="0" aria-valuemax="100"><span style="width: ${item.progress}%"></span></span>`
          }
          <span class="upload-row__progress">${escapeHtml(statusText)}</span>
          <span class="upload-row__time">${escapeHtml(item.message || "")}</span>
          <button class="ghost-icon" type="button" aria-label="Upload queue item">
            ${isFailed ? warningIcon() : closeIcon()}
          </button>
        </li>
      `;
    })
    .join("");
}

function renderFiles(): void {
  const filesTitle = document.querySelector<HTMLElement>("[data-cv-files-title]");
  const activeFilters = document.querySelector<HTMLElement>("[data-cv-active-filters]");
  const body = document.querySelector<HTMLElement>("[data-cv-file-table-body]");
  const selectionSummary = document.querySelector<HTMLElement>("[data-cv-selection-summary]");
  const pageSummary = document.querySelector<HTMLElement>("[data-cv-page-summary]");
  const filteredFiles = filterFiles(library.files.filter((entry) => entry.status !== "deleted"), filters);

  if (selectedFileId && !filteredFiles.some((entry) => entry.id === selectedFileId)) {
    selectedFileId = filteredFiles[0]?.id ?? null;
  }
  if (!selectedFileId) {
    selectedFileId = filteredFiles[0]?.id ?? null;
  }

  if (filesTitle) filesTitle.textContent = `Files (${filteredFiles.length})`;
  if (selectionSummary) selectionSummary.textContent = selectedFileId ? "1 selected" : "No file selected";
  if (pageSummary) pageSummary.textContent = filteredFiles.length ? `1-${Math.min(50, filteredFiles.length)} of ${filteredFiles.length}` : "0 files";
  if (activeFilters) activeFilters.innerHTML = renderActiveFilters();
  if (!body) return;

  body.innerHTML = filteredFiles.length
    ? filteredFiles.map((fileRecord) => renderFileRow(fileRecord)).join("")
    : `<tr><td colspan="8"><div class="empty-state">No files match the current filters.</div></td></tr>`;
}

function renderActiveFilters(): string {
  const chips: string[] = [];
  const projectRecord = filters.projectId ? library.projects.find((entry) => entry.id === filters.projectId) : null;
  const folderRecord = filters.folderId ? library.folders.find((entry) => entry.id === filters.folderId) : null;
  const tagRecord = filters.tagSlug ? library.tags.find((entry) => entry.slug === filters.tagSlug) : null;

  if (projectRecord) chips.push(filterChip(projectRecord.name));
  if (folderRecord) chips.push(filterChip(folderRecord.name));
  if (tagRecord) chips.push(filterChip(tagRecord.name));
  if (configurationMissing) chips.push(filterChip("Preview data"));

  return `${chips.join("")}${chips.length ? `<button class="link-button" type="button" data-cv-clear-filters>Clear filters</button>` : ""}`;
}

function filterChip(label: string): string {
  return `
    <button class="filter-chip" type="button" data-cv-clear-filters>
      ${escapeHtml(label)}
      ${closeIcon()}
    </button>
  `;
}

function renderFileRow(fileRecord: FileRecord): string {
  const ext = extensionForFile(fileRecord);
  const isSelected = fileRecord.id === selectedFileId;
  return `
    <tr class="${isSelected ? "is-selected" : ""}" data-cv-file-row data-cv-file-id="${escapeAttr(fileRecord.id)}" tabindex="0" aria-selected="${isSelected ? "true" : "false"}">
      <td class="select-cell">
        <label class="checkbox"><input type="checkbox" ${isSelected ? "checked" : ""} /><span></span><span class="sr-only">Select ${escapeHtml(fileRecord.displayName)}</span></label>
      </td>
      <td>
        <span class="file-name">
          <span class="file-type-icon" data-ext="${escapeAttr(ext)}">${escapeHtml(ext)}</span>
          <span>${escapeHtml(fileRecord.displayName)}</span>
        </span>
      </td>
      <td><span class="chip-list">${fileRecord.tags.map((entry) => `<span class="mini-chip">${escapeHtml(entry.name)}</span>`).join("")}</span></td>
      <td>${escapeHtml(typeLabel(fileRecord))}</td>
      <td>${formatBytes(fileRecord.sizeBytes)}</td>
      <td class="date-cell">${escapeHtml(formatDate(fileRecord.updatedAt))}</td>
      <td class="icon-cell"><button class="star-button" type="button" aria-label="Star file">${starIcon()}</button></td>
      <td class="icon-cell"><button class="ghost-icon" type="button" aria-label="Open actions">${moreIcon()}</button></td>
    </tr>
  `;
}

function renderInspector(): void {
  const selectedFile = library.files.find((entry) => entry.id === selectedFileId) ?? null;
  const name = document.querySelector<HTMLElement>("[data-cv-selected-file-name]");
  const icon = document.querySelector<HTMLElement>("[data-cv-selected-file-icon]");
  const metadata = document.querySelector<HTMLElement>("[data-cv-metadata-list]");
  const downloadButton = document.querySelector<HTMLButtonElement>("[data-cv-download-button]");
  const deleteButton = document.querySelector<HTMLButtonElement>("[data-cv-delete-button]");

  if (!selectedFile) {
    if (name) name.textContent = "No file selected";
    if (icon) {
      icon.textContent = "FILE";
      icon.dataset.ext = "FILE";
    }
    if (metadata) metadata.innerHTML = `<div><dt>Status</dt><dd>Select a file to inspect metadata.</dd></div>`;
    if (downloadButton) downloadButton.disabled = true;
    if (deleteButton) deleteButton.disabled = true;
    return;
  }

  const ext = extensionForFile(selectedFile);
  if (name) name.textContent = selectedFile.displayName;
  if (icon) {
    icon.textContent = ext;
    icon.dataset.ext = ext;
  }
  if (downloadButton) downloadButton.disabled = false;
  if (deleteButton) deleteButton.disabled = false;
  if (metadata) metadata.innerHTML = renderMetadata(selectedFile);
}

function renderMetadata(fileRecord: FileRecord): string {
  const projectRecord = library.projects.find((entry) => entry.id === fileRecord.projectId);
  const folderRecord = fileRecord.folderId ? library.folders.find((entry) => entry.id === fileRecord.folderId) : null;
  const rows: Array<[string, string]> = [
    ["Type", typeLabel(fileRecord)],
    ["Size", `${formatBytes(fileRecord.sizeBytes)} (${fileRecord.sizeBytes.toLocaleString()} bytes)`],
    ["Location", [projectRecord?.name, folderRecord?.name].filter(Boolean).join(" / ") || "Unfiled"],
    ["Modified", formatDate(fileRecord.updatedAt)],
    ["Created", formatDate(fileRecord.createdAt)],
    ["Owner", fileRecord.actorEmail || "owner@chemvault.science"],
    ["Description", configurationMissing ? "Preview data. Connect D1 and R2 to inspect live file metadata." : "ChemVault managed file metadata."],
    ["Format", extensionForFile(fileRecord)],
    ["Checksum (MD5)", fileRecord.checksum || "Not recorded"],
  ];

  const tagRow = `
    <div>
      <dt>Tags</dt>
      <dd>
        <span class="chip-list">${fileRecord.tags.map((entry) => `<span class="mini-chip">${escapeHtml(entry.name)}</span>`).join("") || "No tags"}</span>
      </dd>
    </div>
  `;

  return `${rows
    .slice(0, 6)
    .map(([label, value]) => metadataRow(label, value, label === "Location"))
    .join("")}${tagRow}${rows
    .slice(6)
    .map(([label, value]) => metadataRow(label, value, false))
    .join("")}`;
}

function metadataRow(label: string, value: string, location: boolean): string {
  return `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd class="${location ? "metadata-location" : ""}">
        ${location ? `${folderIcon()}<span>${escapeHtml(value)}</span>` : escapeHtml(value)}
      </dd>
    </div>
  `;
}

async function handleFiles(fileList: FileList | null): Promise<void> {
  const files = Array.from(fileList ?? []);
  for (const browserFile of files) {
    await uploadBrowserFile(browserFile);
  }
}

async function uploadBrowserFile(browserFile: File): Promise<void> {
  const queueId = `local_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  uploadQueue = reduceUploadQueue(uploadQueue, { type: "add", id: queueId, name: browserFile.name, sizeBytes: browserFile.size });
  renderQueue();

  try {
    const activeProjectId = filters.projectId || library.projects[0]?.id;
    if (!activeProjectId) throw new Error("Project is required before upload");
    const init = await fetchJson<InitUploadResponse>("/api/files/init", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: browserFile.name,
        size: browserFile.size,
        mimeType: browserFile.type || null,
        projectId: activeProjectId,
        folderId: filters.folderId,
        tags: filters.tagSlug ? [library.tags.find((entry) => entry.slug === filters.tagSlug)?.name].filter(Boolean) : [],
      }),
    });

    await uploadFileBytes(init.upload.url, browserFile, (loadedBytes) => {
      uploadQueue = reduceUploadQueue(uploadQueue, { type: "progress", id: queueId, loadedBytes });
      renderQueue();
    });

    await fetchJson<{ status: string; fileId: string }>("/api/files/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileId: init.file.id, sessionId: init.session.id }),
    });

    uploadQueue = reduceUploadQueue(uploadQueue, { type: "complete", id: queueId });
    selectedFileId = init.file.id;
    await reloadLibrary();
  } catch (error) {
    uploadQueue = reduceUploadQueue(uploadQueue, { type: "fail", id: queueId, message: errorMessage(error) });
    renderQueue();
  }
}

function uploadFileBytes(url: string, fileToUpload: File, onProgress: (loadedBytes: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.setRequestHeader("content-type", fileToUpload.type || "application/octet-stream");
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(event.loaded);
    });
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with ${request.status}`));
      }
    });
    request.addEventListener("error", () => reject(new Error("Upload failed")));
    request.send(fileToUpload);
  });
}

async function reloadLibrary(): Promise<void> {
  try {
    library = await fetchJson<LibraryResponse>("/api/library");
    configurationMissing = false;
  } catch {
    configurationMissing = true;
  }
  renderAll();
}

async function deleteSelectedFile(): Promise<void> {
  if (!selectedFileId) return;
  const fileId = selectedFileId;
  try {
    await fetchJson<{ status: string; fileId: string }>(`/api/files/${encodeURIComponent(fileId)}`, { method: "DELETE" });
    selectedFileId = null;
    await reloadLibrary();
  } catch (error) {
    uploadQueue = reduceUploadQueue(uploadQueue, {
      type: "add",
      id: `delete_${Date.now()}`,
      name: "Delete request",
      sizeBytes: 0,
    });
    const latest = uploadQueue[0];
    if (latest) {
      uploadQueue = reduceUploadQueue(uploadQueue, { type: "fail", id: latest.id, message: errorMessage(error) });
    }
    renderQueue();
  }
}

function pickSelectedFileId(): string | null {
  if (selectedFileId && library.files.some((entry) => entry.id === selectedFileId && entry.status !== "deleted")) {
    return selectedFileId;
  }
  return library.files.find((entry) => entry.status !== "deleted")?.id ?? null;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function typeLabel(fileRecord: FileRecord): string {
  if (fileRecord.mimeType?.includes("jcamp")) return "JCAMP-DX";
  if (fileRecord.mimeType === "application/pdf") return "PDF";
  if (fileRecord.mimeType === "text/csv") return "CSV";
  return extensionForFile(fileRecord);
}

function extensionForFile(fileRecord: FileRecord): string {
  if (fileRecord.mimeType?.includes("jcamp")) return "JCAMP";
  return extensionForName(fileRecord.displayName);
}

function extensionForName(name: string): string {
  const extension = name.includes(".") ? name.split(".").pop() || "FILE" : "FILE";
  return extension.slice(0, 5).toUpperCase();
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "untitled";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}

function lockIcon(): string {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V7a5 5 0 0 1 10 0v3M6.5 10h11A1.5 1.5 0 0 1 19 11.5v7A1.5 1.5 0 0 1 17.5 20h-11A1.5 1.5 0 0 1 5 18.5v-7A1.5 1.5 0 0 1 6.5 10Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" /></svg>`;
}

function folderIcon(): string {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H10l2 2h5.5A2.5 2.5 0 0 1 20 9.5v7A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-9Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" /></svg>`;
}

function chevronIcon(direction: "down" | "right"): string {
  const path = direction === "down" ? "m8 10 4 4 4-4" : "m10 8 4 4-4 4";
  return `<svg class="icon folder-row__chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="${path}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>`;
}

function closeIcon(): string {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>`;
}

function checkIcon(): string {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 12 3.2 3.2L17.5 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8" /></svg>`;
}

function warningIcon(): string {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 4 9 16H3l9-16Zm0 5v5m0 3v.1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>`;
}

function starIcon(): string {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.8 2.5 5.1 5.6.8-4.1 4 1 5.6-5-2.6-5 2.6 1-5.6-4.1-4 5.6-.8L12 3.8Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /></svg>`;
}

function moreIcon(): string {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6.5h.01M12 12h.01M12 17.5h.01" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" /></svg>`;
}
