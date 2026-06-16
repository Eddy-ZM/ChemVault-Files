import {
  createInitialLibrary,
  filterFiles,
  formatBytes,
  mergeTags,
  normalizeActorEmail,
  reduceUploadQueue,
  resolveLibraryDisplay,
  sortFiles,
  summarizeFiles,
  type FileFilters,
  type FileQuickFilter,
  type FileSort,
  type UploadQueueItem,
} from "../lib/chemvault-files/client-state";
import type { FileRecord, FolderRecord, LibraryResponse, ProjectRecord, TagRecord } from "../lib/chemvault-files/types";

interface HealthResponse {
  status: "ready" | "configuration-missing";
  api: string;
  d1: "online" | "missing";
  r2: "online" | "missing";
  environment: string;
  actorEmail?: string | null;
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
  tag("tag_hplc", "HPLC", "hplc", null),
  tag("tag_ir", "IR", "ir", null),
  tag("tag_chiral", "Chiral", "chiral", null),
  tag("tag_dft", "DFT", "dft", null),
  tag("tag_kinetics", "Kinetics", "kinetics", null),
  tag("tag_pk_pd", "PK/PD", "pk-pd", null),
  tag("tag_raw_data", "Raw Data", "raw-data", "#1d7f42"),
  tag("tag_pdf", "PDF", "pdf", "#d70015"),
  tag("tag_screen", "Screen", "screen", null),
  tag("tag_si", "SI", "si", null),
  tag("tag_1h", "1H", "1h", null),
  tag("tag_13c", "13C", "13c", null),
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
    file("file_seed_6", "project_datasets", "folder_datasets", "dataset_reaction_screen_042.h5", "application/x-hdf5", 2480343613, ["Raw Data", "Screen"]),
    file("file_seed_7", "project_datasets", "folder_datasets", "failed_upload_package.zip", "application/zip", 3886942618, ["Raw Data"], "failed"),
    file("file_seed_8", "project_manuscripts", null, "Supplementary_Information.pdf", "application/pdf", 2516582, ["SI", "PDF"]),
    file("file_seed_9", "project_spectra", "folder_spectra", "Compound_13_1H.jdx", "chemical/x-jcamp-dx", 11744051, ["NMR", "1H"]),
    file("file_seed_10", "project_spectra", "folder_spectra", "FTIR_Compound_14.dat", "application/octet-stream", 7025459, ["IR"]),
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

let library: LibraryResponse = createInitialLibrary(seedLibrary);
let filters: FileFilters = {
  search: "",
  projectId: null,
  folderId: null,
  tagSlug: null,
  quickFilter: null,
};
let selectedFileId: string | null = null;
let selectedFileIds = new Set<string>();
let uploadQueue: UploadQueueItem[] = [];
let configurationMissing = false;
let previewMode = false;
let libraryLoading = true;
let healthEnvironment = "local";
let currentActorEmail = "owner@chemvault.science";
let fileSort: FileSort = { key: "modified", direction: "desc" };
let viewMode: "list" | "grid" = "list";

export function bootChemVaultFiles(): void {
  const shell = document.querySelector<HTMLElement>("[data-cv-shell]");
  if (!shell || shell.dataset.cvBooted === "true") return;

  shell.dataset.cvBooted = "true";
  bindEvents();
  renderAccountIdentity();
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
  tagNames: string[],
  status: FileRecord["status"] = "ready"
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
    status,
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
    renderInspector();
  });

  document.addEventListener("keydown", (event) => {
    const target = event.target as HTMLElement | null;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      document.querySelector<HTMLInputElement>("[data-cv-search-input]")?.focus();
    }
    if (event.key === "Escape" && !target?.closest("[data-cv-search-input]")) {
      closeAuthModal();
    }
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
    filters = { search: filters.search, projectId: null, folderId: null, tagSlug: null, quickFilter: null };
    renderAll();
  });

  document.querySelector<HTMLElement>("[data-cv-file-table-body]")?.addEventListener("click", (event) => {
    const row = (event.target as HTMLElement).closest<HTMLTableRowElement>("[data-cv-file-id]");
    if (!row) return;
    const checkbox = (event.target as HTMLElement).closest<HTMLInputElement>("input[type='checkbox']");
    if (checkbox) {
      toggleSelectedFile(row.dataset.cvFileId || null, checkbox.checked);
      renderFiles();
      renderInspector();
      return;
    }
    selectedFileId = row.dataset.cvFileId || null;
    selectedFileIds = selectedFileId ? new Set([selectedFileId]) : new Set();
    renderFiles();
    renderInspector();
  });

  document.querySelector<HTMLElement>("[data-cv-card-grid]")?.addEventListener("click", (event) => {
    const card = (event.target as HTMLElement).closest<HTMLElement>("[data-cv-file-id]");
    if (!card) return;
    const checkbox = (event.target as HTMLElement).closest<HTMLInputElement>("input[type='checkbox']");
    if (checkbox) {
      toggleSelectedFile(card.dataset.cvFileId || null, checkbox.checked);
    } else {
      selectedFileId = card.dataset.cvFileId || null;
      selectedFileIds = selectedFileId ? new Set([selectedFileId]) : new Set();
    }
    renderFiles();
    renderInspector();
  });

  document.querySelector<HTMLInputElement>("[data-cv-select-all]")?.addEventListener("change", (event) => {
    const checked = (event.currentTarget as HTMLInputElement).checked;
    const visibleFileIds = getVisibleFiles().map((entry) => entry.id);
    selectedFileIds = checked ? new Set(visibleFileIds) : new Set();
    selectedFileId = checked ? visibleFileIds[0] ?? null : null;
    renderFiles();
    renderInspector();
  });

  document.querySelector<HTMLElement>("[data-cv-file-panel]")?.addEventListener("click", (event) => {
    const sortButton = (event.target as HTMLElement).closest<HTMLElement>("[data-cv-sort]");
    if (sortButton) {
      const key = sortButton.dataset.cvSort as FileSort["key"];
      fileSort = {
        key,
        direction: fileSort.key === key && fileSort.direction === "asc" ? "desc" : "asc",
      };
      renderFiles();
      return;
    }

    const quickFilter = (event.target as HTMLElement).closest<HTMLElement>("[data-cv-quick-filter]");
    if (quickFilter) {
      const next = quickFilter.dataset.cvQuickFilter || null;
      filters = {
        ...filters,
        quickFilter: next === filters.quickFilter ? null : (next as FileQuickFilter | null),
      };
      renderAll();
      return;
    }

    const viewButton = (event.target as HTMLElement).closest<HTMLElement>("[data-cv-view-mode]");
    if (viewButton) {
      viewMode = viewButton.dataset.cvViewMode === "grid" ? "grid" : "list";
      renderFiles();
      return;
    }
  });

  document.querySelector<HTMLElement>("[data-cv-bulk-bar]")?.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (target.closest("[data-cv-bulk-clear]")) {
      selectedFileIds = new Set();
      selectedFileId = null;
      renderFiles();
      renderInspector();
      return;
    }
    if (target.closest("[data-cv-bulk-download]")) {
      downloadSelectionManifest();
      return;
    }
    if (target.closest("[data-cv-bulk-tag]")) {
      applyLocalReviewTag();
    }
  });

  document.querySelector<HTMLElement>("[data-cv-account-button]")?.addEventListener("click", openAuthModal);
  document.querySelectorAll<HTMLElement>("[data-cv-auth-close]").forEach((element) => element.addEventListener("click", closeAuthModal));

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
    healthEnvironment = health.environment || "local";
    currentActorEmail = normalizeActorEmail(health.actorEmail);
    renderAccountIdentity();
    renderHealth(health);
  } catch {
    configurationMissing = true;
    previewMode = true;
    renderHealth();
  }

  try {
    const remoteLibrary = await fetchJson<LibraryResponse>("/api/library");
    const displayState = resolveLibraryDisplay({
      remoteLibrary,
      seedLibrary,
      environment: healthEnvironment,
      hostname: window.location.hostname,
    });
    configurationMissing = false;
    previewMode = displayState.previewMode;
    library = previewMode ? applyPreviewActorEmail(displayState.library) : displayState.library;
    uploadQueue = previewMode ? seedUploadQueue : [];
  } catch {
    configurationMissing = true;
    applyUnavailableLibraryFallback(false);
  }

  libraryLoading = false;
  selectedFileId = pickSelectedFileId();
  selectedFileIds = selectedFileId ? new Set([selectedFileId]) : new Set();
  renderAll();
}

function applyPreviewActorEmail(source: LibraryResponse): LibraryResponse {
  return {
    ...source,
    files: source.files.map((fileRecord) => ({
      ...fileRecord,
      actorEmail:
        normalizeActorEmail(fileRecord.actorEmail) === "owner@chemvault.science"
          ? currentActorEmail
          : fileRecord.actorEmail,
    })),
  };
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
  renderAccountIdentity();
  renderSidebar();
  renderInsights();
  renderQueue();
  renderFiles();
  renderInspector();
}

function renderAccountIdentity(): void {
  const email = normalizeActorEmail(currentActorEmail);
  const initials = initialsForEmail(email);
  document.querySelectorAll<HTMLElement>("[data-cv-account-avatar], [data-cv-auth-avatar]").forEach((element) => {
    element.textContent = initials;
  });
  document.querySelectorAll<HTMLElement>("[data-cv-account-email]").forEach((element) => {
    element.textContent = email;
    element.title = email;
  });
  document.querySelectorAll<HTMLInputElement>("[data-cv-auth-email]").forEach((element) => {
    element.value = email;
  });
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

function renderInsights(): void {
  const container = document.querySelector<HTMLElement>("[data-cv-insights]");
  if (libraryLoading) {
    renderStorageMeter(0);
    if (container) {
      container.innerHTML = [
        insightCard("Indexed Storage", "Loading", "Reading D1 index"),
        insightCard("Ready Files", "Loading", "Checking R2 objects"),
        insightCard("Needs Review", "Loading", "Checking uploads"),
        insightCard("Largest Object", "Loading", "Reading metadata"),
        insightCard("Latest Change", "Loading", "Reading activity"),
      ].join("");
    }
    return;
  }

  const activeFiles = library.files.filter((entry) => entry.status !== "deleted");
  const summary = summarizeFiles(activeFiles);
  renderStorageMeter(summary.totalBytes);
  if (!container) return;

  const reviewLabel = summary.failedCount === 1 ? "failed upload" : "failed uploads";
  const latestLabel = summary.latestFile ? summary.latestFile.displayName : "No file activity";
  const largestLabel = summary.largestFile ? summary.largestFile.displayName : "No stored objects";

  container.innerHTML = [
    insightCard("Indexed Storage", formatBytes(summary.totalBytes), `${activeFiles.length} files tracked`),
    insightCard("Ready Files", String(summary.readyCount), "R2 objects ready"),
    insightCard("Needs Review", String(summary.failedCount), reviewLabel, summary.failedCount > 0),
    insightCard("Largest Object", summary.largestFile ? formatBytes(summary.largestFile.sizeBytes) : "0 B", largestLabel),
    insightCard("Latest Change", summary.latestFile ? formatDate(summary.latestFile.updatedAt) : "No changes", latestLabel),
  ].join("");
}

function renderStorageMeter(totalBytes: number): void {
  const quotaBytes = 4 * 1024 ** 4;
  const rawPercent = (totalBytes / quotaBytes) * 100;
  const meterPercent = totalBytes > 0 ? Math.max(2, Math.min(100, rawPercent)) : 0;
  const percentText = totalBytes > 0 && rawPercent < 1 ? "<1%" : `${Math.min(100, Math.round(rawPercent))}%`;
  const caption = document.querySelector<HTMLElement>("[data-cv-storage-caption]");
  const meter = document.querySelector<HTMLElement>("[data-cv-storage-meter]");
  const percentLabel = document.querySelector<HTMLElement>("[data-cv-storage-percent]");
  if (caption) caption.textContent = `${formatBytes(totalBytes)} of 4 TB indexed`;
  if (meter) meter.style.width = `${meterPercent}%`;
  if (percentLabel) percentLabel.textContent = percentText;
}

function insightCard(label: string, value: string, detail: string, warning = false): string {
  return `
    <article class="insight-card${warning ? " insight-card--warning" : ""}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(detail)}</small>
    </article>
  `;
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
  const cardGrid = document.querySelector<HTMLElement>("[data-cv-card-grid]");
  const listRegion = document.querySelector<HTMLElement>("[data-cv-list-region]");
  const filePanel = document.querySelector<HTMLElement>("[data-cv-file-panel]");
  const selectionSummary = document.querySelector<HTMLElement>("[data-cv-selection-summary]");
  const pageSummary = document.querySelector<HTMLElement>("[data-cv-page-summary]");
  const bulkBar = document.querySelector<HTMLElement>("[data-cv-bulk-bar]");
  const bulkSummary = document.querySelector<HTMLElement>("[data-cv-bulk-summary]");
  const selectAll = document.querySelector<HTMLInputElement>("[data-cv-select-all]");
  const filteredFiles = getVisibleFiles();
  const visibleIds = new Set(filteredFiles.map((entry) => entry.id));

  selectedFileIds = new Set(Array.from(selectedFileIds).filter((id) => visibleIds.has(id)));

  if (selectedFileId && !filteredFiles.some((entry) => entry.id === selectedFileId)) {
    selectedFileId = selectedFileIds.values().next().value ?? filteredFiles[0]?.id ?? null;
  }
  if (!selectedFileId) {
    selectedFileId = selectedFileIds.values().next().value ?? filteredFiles[0]?.id ?? null;
  }

  if (filesTitle) filesTitle.textContent = libraryLoading ? "Files" : `Files (${filteredFiles.length})`;
  if (selectionSummary) selectionSummary.textContent = selectedFileIds.size ? `${selectedFileIds.size} selected` : "No files checked";
  if (pageSummary) pageSummary.textContent = libraryLoading ? "Loading" : filteredFiles.length ? `1-${Math.min(50, filteredFiles.length)} of ${filteredFiles.length}` : "0 files";
  if (activeFilters) activeFilters.innerHTML = renderActiveFilters();
  if (bulkBar) bulkBar.hidden = selectedFileIds.size === 0;
  if (bulkSummary) bulkSummary.textContent = selectedFileIds.size === 1 ? "1 file selected" : `${selectedFileIds.size} files selected`;
  if (selectAll) {
    selectAll.checked = filteredFiles.length > 0 && filteredFiles.every((entry) => selectedFileIds.has(entry.id));
    selectAll.indeterminate = selectedFileIds.size > 0 && !selectAll.checked;
  }
  updateSortButtons();
  updateQuickFilterButtons();
  updateViewModeButtons();

  if (filePanel) filePanel.classList.toggle("is-grid-view", viewMode === "grid");
  if (listRegion) listRegion.hidden = viewMode !== "list";
  if (cardGrid) cardGrid.hidden = viewMode !== "grid";

  if (body) {
    body.innerHTML = libraryLoading
      ? `<tr><td colspan="8"><div class="empty-state">Loading file index...</div></td></tr>`
      : filteredFiles.length
      ? filteredFiles.map((fileRecord) => renderFileRow(fileRecord)).join("")
      : `<tr><td colspan="8"><div class="empty-state">No files match the current filters.</div></td></tr>`;
  }

  if (cardGrid) {
    cardGrid.innerHTML = libraryLoading
      ? `<div class="empty-state">Loading file index...</div>`
      : filteredFiles.length
      ? filteredFiles.map((fileRecord) => renderFileCard(fileRecord)).join("")
      : `<div class="empty-state">No files match the current filters.</div>`;
  }
}

function renderActiveFilters(): string {
  const chips: string[] = [];
  const projectRecord = filters.projectId ? library.projects.find((entry) => entry.id === filters.projectId) : null;
  const folderRecord = filters.folderId ? library.folders.find((entry) => entry.id === filters.folderId) : null;
  const tagRecord = filters.tagSlug ? library.tags.find((entry) => entry.slug === filters.tagSlug) : null;

  if (projectRecord) chips.push(filterChip(projectRecord.name));
  if (folderRecord) chips.push(filterChip(folderRecord.name));
  if (tagRecord) chips.push(filterChip(tagRecord.name));
  if (filters.quickFilter) chips.push(filterChip(quickFilterLabel(filters.quickFilter)));
  if (previewMode) chips.push(filterChip("Preview data"));
  if (configurationMissing && !previewMode) chips.push(filterChip("Configuration missing"));

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
  const isSelected = selectedFileIds.has(fileRecord.id);
  const isFailed = fileRecord.status === "failed";
  return `
    <tr class="${isSelected ? "is-selected" : ""}${isFailed ? " is-failed" : ""}" data-cv-file-row data-cv-file-id="${escapeAttr(fileRecord.id)}" tabindex="0" aria-selected="${isSelected ? "true" : "false"}">
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
      <td class="icon-cell">${
        isFailed
          ? `<span class="failed-state">${warningIcon()} Failed</span>`
          : `<button class="star-button" type="button" aria-label="Star file">${starIcon()}</button>`
      }</td>
      <td class="icon-cell">${isFailed ? `<button class="link-button" type="button">Retry</button>` : ""}<button class="ghost-icon" type="button" aria-label="Open actions">${moreIcon()}</button></td>
    </tr>
  `;
}

function renderFileCard(fileRecord: FileRecord): string {
  const ext = extensionForFile(fileRecord);
  const isSelected = selectedFileIds.has(fileRecord.id);
  const isFailed = fileRecord.status === "failed";
  const projectRecord = library.projects.find((entry) => entry.id === fileRecord.projectId);
  return `
    <article class="file-card${isSelected ? " is-selected" : ""}${isFailed ? " is-failed" : ""}" data-cv-file-id="${escapeAttr(fileRecord.id)}" tabindex="0" aria-selected="${isSelected ? "true" : "false"}">
      <header>
        <label class="checkbox"><input type="checkbox" ${isSelected ? "checked" : ""} /><span></span><span class="sr-only">Select ${escapeHtml(fileRecord.displayName)}</span></label>
        <span class="file-type-icon" data-ext="${escapeAttr(ext)}">${escapeHtml(ext)}</span>
        <button class="ghost-icon" type="button" aria-label="Open actions">${moreIcon()}</button>
      </header>
      <h3>${escapeHtml(fileRecord.displayName)}</h3>
      <p>${escapeHtml(projectRecord?.name ?? "Unfiled")} · ${escapeHtml(formatDate(fileRecord.updatedAt))}</p>
      <div class="file-card__meta">
        <span>${escapeHtml(typeLabel(fileRecord))}</span>
        <strong>${formatBytes(fileRecord.sizeBytes)}</strong>
      </div>
      <div class="chip-list">${fileRecord.tags.map((entry) => `<span class="mini-chip">${escapeHtml(entry.name)}</span>`).join("") || "<span class=\"mini-chip\">No tags</span>"}</div>
      ${isFailed ? `<span class="failed-state">${warningIcon()} Needs review</span>` : ""}
    </article>
  `;
}

function renderInspector(): void {
  const selectedFile = library.files.find((entry) => entry.id === selectedFileId) ?? null;
  const name = document.querySelector<HTMLElement>("[data-cv-selected-file-name]");
  const icon = document.querySelector<HTMLElement>("[data-cv-selected-file-icon]");
  const metadata = document.querySelector<HTMLElement>("[data-cv-metadata-list]");
  const downloadButton = document.querySelector<HTMLButtonElement>("[data-cv-download-button]");
  const deleteButton = document.querySelector<HTMLButtonElement>("[data-cv-delete-button]");

  if (libraryLoading) {
    if (name) name.textContent = "Loading files";
    if (icon) {
      icon.textContent = "FILE";
      icon.dataset.ext = "FILE";
    }
    if (metadata) metadata.innerHTML = `<div><dt>Status</dt><dd>Reading library metadata.</dd></div>`;
    if (downloadButton) downloadButton.disabled = true;
    if (deleteButton) deleteButton.disabled = true;
    return;
  }

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
  const isNmrPreview = previewMode && fileRecord.displayName === "Compound_14_1H.jdx";
  const rows: Array<[string, string]> = [
    ["Type", typeLabel(fileRecord)],
    ["Size", `${formatBytes(fileRecord.sizeBytes)} (${fileRecord.sizeBytes.toLocaleString()} bytes)`],
    ["Location", [projectRecord?.name, folderRecord?.name].filter(Boolean).join(" / ") || "Unfiled"],
    ["Modified", formatDate(fileRecord.updatedAt)],
    ["Created", formatDate(fileRecord.createdAt)],
    ["Owner", fileRecord.actorEmail || "owner@chemvault.science"],
    ["Description", isNmrPreview ? "1H NMR spectrum of Compound 14 in CDCl3 at 400 MHz." : configurationMissing || previewMode ? "Preview data. Upload a file to replace this local seed row." : "ChemVault managed file metadata."],
    ...(isNmrPreview
      ? ([
          ["Sample ID", "C14-2024-05-21"],
          ["Instrument", "Bruker Avance III 400"],
          ["Solvent", "CDCl3"],
          ["Temperature", "298 K"],
          ["Spectrometer Frequency", "400.13 MHz"],
          ["Scans", "16"],
          ["Relaxation Delay", "2.0 s"],
          ["Spectral Width", "8012.8 Hz"],
          ["Data Points", "65536"],
          ["Format", "JCAMP-DX 5.00"],
          ["Checksum (MD5)", "8f2d6b7c3e4a9f6b5d7e2a1c9b0d8e7f"],
        ] satisfies Array<[string, string]>)
      : ([
          ["Format", extensionForFile(fileRecord)],
          ["Checksum (MD5)", fileRecord.checksum || "Not recorded"],
        ] satisfies Array<[string, string]>)),
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
    const remoteLibrary = await fetchJson<LibraryResponse>("/api/library");
    const displayState = resolveLibraryDisplay({
      remoteLibrary,
      seedLibrary,
      environment: healthEnvironment,
      hostname: window.location.hostname,
    });
    configurationMissing = false;
    previewMode = displayState.previewMode;
    library = displayState.library;
  } catch {
    configurationMissing = true;
    applyUnavailableLibraryFallback(true);
  }
  libraryLoading = false;
  selectedFileId = pickSelectedFileId();
  selectedFileIds = selectedFileId ? new Set([selectedFileId]) : new Set();
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

function applyUnavailableLibraryFallback(preserveCurrentLibrary: boolean): void {
  const displayState = resolveLibraryDisplay({
    remoteLibrary: createInitialLibrary(seedLibrary),
    seedLibrary,
    environment: healthEnvironment,
    hostname: window.location.hostname,
  });
  previewMode = displayState.previewMode;
  if (previewMode) {
    library = displayState.library;
    uploadQueue = seedUploadQueue;
    return;
  }
  if (!preserveCurrentLibrary) {
    library = displayState.library;
    uploadQueue = [];
  }
}

function getVisibleFiles(): FileRecord[] {
  return sortFiles(filterFiles(library.files.filter((entry) => entry.status !== "deleted"), filters), fileSort);
}

function toggleSelectedFile(fileId: string | null, selected: boolean): void {
  if (!fileId) return;
  const next = new Set(selectedFileIds);
  if (selected) {
    next.add(fileId);
    selectedFileId = fileId;
  } else {
    next.delete(fileId);
    if (selectedFileId === fileId) selectedFileId = next.values().next().value ?? null;
  }
  selectedFileIds = next;
}

function updateSortButtons(): void {
  document.querySelectorAll<HTMLElement>("[data-cv-sort]").forEach((button) => {
    const isActive = button.dataset.cvSort === fileSort.key;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-sort", isActive ? fileSort.direction : "none");
    button.dataset.cvSortDirection = isActive ? fileSort.direction : "";
  });
}

function updateQuickFilterButtons(): void {
  document.querySelectorAll<HTMLElement>("[data-cv-quick-filter]").forEach((button) => {
    const value = button.dataset.cvQuickFilter || null;
    const isActive = value === (filters.quickFilter ?? null);
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function updateViewModeButtons(): void {
  document.querySelectorAll<HTMLElement>("[data-cv-view-mode]").forEach((button) => {
    const isActive = button.dataset.cvViewMode === viewMode;
    button.classList.toggle("segmented-control__button--active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function quickFilterLabel(filter: FileQuickFilter): string {
  if (filter === "ready") return "Ready";
  if (filter === "failed") return "Needs review";
  return "Large objects";
}

function downloadSelectionManifest(): void {
  const selectedFiles = library.files.filter((entry) => selectedFileIds.has(entry.id));
  if (selectedFiles.length === 0) return;
  if (selectedFiles.length === 1) {
    window.location.href = `/api/files/${encodeURIComponent(selectedFiles[0].id)}/download`;
    return;
  }

  const manifest = {
    exportedAt: new Date().toISOString(),
    source: "ChemVault Files selection",
    files: selectedFiles.map((entry) => ({
      id: entry.id,
      name: entry.displayName,
      sizeBytes: entry.sizeBytes,
      type: typeLabel(entry),
      r2Key: entry.r2Key,
      tags: entry.tags.map((tagRecord) => tagRecord.name),
    })),
  };
  const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "chemvault-selection-manifest.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function applyLocalReviewTag(): void {
  if (selectedFileIds.size === 0) return;
  const reviewTag = tag("tag_review", "Review", "review", "#ff9f0a");
  library = {
    ...library,
    tags: mergeTags(library.tags, [reviewTag]),
    files: library.files.map((fileRecord) => {
      if (!selectedFileIds.has(fileRecord.id) || fileRecord.tags.some((entry) => entry.slug === reviewTag.slug)) return fileRecord;
      return { ...fileRecord, tags: [...fileRecord.tags, reviewTag] };
    }),
  };
  renderAll();
}

function openAuthModal(): void {
  const modal = document.querySelector<HTMLElement>("[data-cv-auth-modal]");
  if (!modal) return;
  renderAccountIdentity();
  modal.hidden = false;
  modal.querySelector<HTMLInputElement>("[data-cv-auth-email]")?.focus();
}

function closeAuthModal(): void {
  const modal = document.querySelector<HTMLElement>("[data-cv-auth-modal]");
  if (modal) modal.hidden = true;
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

function initialsForEmail(email: string): string {
  const localPart = email.split("@")[0] || "cv";
  const parts = localPart.split(/[._-]+/).filter(Boolean);
  const initials = parts.length > 1 ? `${parts[0][0] ?? ""}${parts[1][0] ?? ""}` : localPart.slice(0, 2);
  return initials.toUpperCase() || "CV";
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
