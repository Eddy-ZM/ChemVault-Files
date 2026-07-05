import {
  buildFileBrowserItems,
  buildFolderTree,
  createInitialLibrary,
  formatBytes,
  formatShareUrl,
  getFolderDeletionScope,
  markFilesDeleted,
  mergeCompletedUploadFiles,
  mergeTags,
  normalizeActorEmail,
  previewKindForFile,
  reduceUploadQueue,
  resolveUploadFolderParts,
  resolveLibraryDisplay,
  splitUploadPath,
  sortFiles,
  summarizeFiles,
  userLoginUrl,
  type FileFilters,
  type FileBrowserItem,
  type FileQuickFilter,
  type FileSort,
  type UploadPathInfo,
  type UploadQueueItem,
} from "../lib/chemvault-files/client-state";
import {
  closeDelayForMotion,
  isTreeNodeExpanded,
  nextInspectorTabMotion,
  nextInspectorPanelCollapsed,
  nextModalMotionState,
  nextSidePanelCollapsed,
  nextWorkspaceView,
  toggleCollapsedId,
  type InspectorTab,
  type ModalMotionState,
  type TabMotionDirection,
  type WorkspaceView,
} from "../lib/chemvault-files/motion";
import {
  assertUploadFileAllowed,
} from "../lib/chemvault-files/validation";
import type {
  ActorAccess,
  FileActivityRecord,
  FileRecord,
  FilePermissionLevel,
  FileRolePolicy,
  FileVisibility,
  FileShareListResponse,
  FileShareRecord,
  FolderRecord,
  LibraryResponse,
  ProjectRecord,
  ShareCreateResponse,
  TagRecord,
} from "../lib/chemvault-files/types";

interface HealthResponse {
  status: "ready" | "configuration-missing";
  api: string;
  d1: "online" | "missing";
  r2: "online" | "missing";
  environment: string;
  authStatus?: "authenticated" | "unauthenticated" | "forbidden";
  loginUrl?: string;
  actorEmail?: string | null;
  actorAccess?: ActorAccess | null;
}

type ShellAuthState = "checking" | "redirecting" | "ready";

interface InitUploadResponse {
  file: FileRecord;
  session: { id: string };
  upload: {
    mode: "direct" | "presigned" | "multipart";
    method: string;
    url: string;
  };
}

interface ActivityResponse {
  activity: FileActivityRecord[];
}

interface InspectorAsyncState<T> {
  loading: boolean;
  data: T | null;
  error: string | null;
}

interface ShareUiState {
  loading: boolean;
  link: string | null;
  message: string | null;
  error: string | null;
  shares: FileShareRecord[] | null;
  listLoading: boolean;
  listError: string | null;
}

interface RolesResponse {
  roles: FileRolePolicy[];
  actorAccess: ActorAccess;
}

interface RoleSettingsState {
  loading: boolean;
  saving: boolean;
  error: string | null;
  message: string | null;
}

interface BrowserUploadSelection {
  file: File;
  relativePath?: string;
}

interface PreparedUploadTarget {
  queueId: string;
  file: File;
  displayName: string;
  queueName: string;
  pathInfo: UploadPathInfo;
}

interface BrowserLocationState {
  projectId: string | null;
  folderId: string | null;
}

interface FileBrowserNotice {
  message: string;
  tone: "info" | "error";
}

interface BrowserFileEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
}

interface BrowserFileSystemFileEntry extends BrowserFileEntry {
  file: (success: (file: File) => void, error?: (error: DOMException) => void) => void;
}

interface BrowserFileSystemDirectoryEntry extends BrowserFileEntry {
  createReader: () => {
    readEntries: (success: (entries: BrowserFileEntry[]) => void, error?: (error: DOMException) => void) => void;
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
  folder("folder_spectra", "project_spectra", "NMR Archive", "nmr-archive", "/NMR Archive"),
  folder("folder_spectra_compound_14", "project_spectra", "Compound 14 NMR", "compound-14-nmr", "/NMR Archive/Compound 14 NMR", "folder_spectra"),
  folder("folder_spectra_reference_ir", "project_spectra", "Reference IR", "reference-ir", "/NMR Archive/Reference IR", "folder_spectra"),
  folder("folder_datasets", "project_datasets", "Experiment Runs", "experiment-runs", "/Experiment Runs"),
  folder("folder_datasets_kinetics", "project_datasets", "Kinetics Runs", "kinetics-runs", "/Experiment Runs/Kinetics Runs", "folder_datasets"),
  folder("folder_datasets_screen_042", "project_datasets", "Screen 042", "screen-042", "/Experiment Runs/Screen 042", "folder_datasets"),
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
    file("file_seed_1", "project_spectra", "folder_spectra_compound_14", "2024-05-21_NMR_Compound_14.zip", "application/zip", 1331439861, ["NMR", "Raw Data"]),
    file("file_seed_2", "project_spectra", "folder_spectra_compound_14", "Compound_14_1H.jdx", "chemical/x-jcamp-dx", 13214592, ["NMR"]),
    file("file_seed_3", "project_spectra", "folder_spectra_compound_14", "Compound_14_13C.jdx", "chemical/x-jcamp-dx", 19188940, ["NMR"]),
    file("file_seed_4", "project_manuscripts", null, "NMR_Analysis_Report_Compound_14.pdf", "application/pdf", 1887436, ["PDF"]),
    file("file_seed_5", "project_datasets", "folder_datasets_kinetics", "kinetics_run_042_processed.csv", "text/csv", 47919923, ["Kinetics", "Raw Data"]),
    file("file_seed_6", "project_datasets", "folder_datasets_screen_042", "dataset_reaction_screen_042.h5", "application/x-hdf5", 2480343613, ["Raw Data", "Screen"]),
    file("file_seed_7", "project_datasets", "folder_datasets_screen_042", "failed_upload_package.zip", "application/zip", 3886942618, ["Raw Data"], "failed"),
    file("file_seed_8", "project_manuscripts", null, "Supplementary_Information.pdf", "application/pdf", 2516582, ["SI", "PDF"]),
    file("file_seed_9", "project_spectra", "folder_spectra_compound_14", "Compound_13_1H.jdx", "chemical/x-jcamp-dx", 11744051, ["NMR", "1H"]),
    file("file_seed_10", "project_spectra", "folder_spectra_reference_ir", "FTIR_Compound_14.dat", "application/octet-stream", 7025459, ["IR"]),
  ],
};

const emptyLibrary: LibraryResponse = {
  projects: [],
  folders: [],
  tags: [],
  files: [],
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

const sidebarCollapsedStorageKey = "chemvault-files:sidebar-collapsed";
const inspectorCollapsedStorageKey = "chemvault-files:inspector-collapsed";
const toastDurationMs = 2200;

let library: LibraryResponse = createInitialLibrary(seedLibrary);
let filters: FileFilters = {
  search: "",
  projectId: null,
  folderId: null,
  tagSlug: null,
  quickFilter: null,
};
let browserHistory: BrowserLocationState[] = [{ projectId: null, folderId: null }];
let browserHistoryIndex = 0;
let collapsedProjectIds = new Set<string>();
let collapsedFolderIds = new Set<string>();
let selectedFileId: string | null = null;
let selectedFileIds = new Set<string>();
let uploadQueue: UploadQueueItem[] = [];
const completedUploadFiles = new Map<string, FileRecord>();
let deletingFolderIds = new Set<string>();
let fileBrowserNotice: FileBrowserNotice | null = null;
let configurationMissing = false;
let previewMode = false;
let libraryLoading = true;
let healthEnvironment = "local";
let authStatus: HealthResponse["authStatus"] = "unauthenticated";
let currentLoginUrl = "https://user.chemvault.science/login";
let currentActorEmail = "";
let currentActorAccess: ActorAccess = {
  actorEmail: currentActorEmail,
  roleId: "role_external",
  roleName: "Common_Out",
  permission: "none",
  canManageRoles: false,
};
let rolePolicies: FileRolePolicy[] = [];
let roleSettingsState: RoleSettingsState = { loading: false, saving: false, error: null, message: null };
let uploadVisibility: FileVisibility = "private";
let uploadRoleIds = new Set<string>(["role_internal", "role_external"]);
let fileSort: FileSort = { key: "modified", direction: "desc" };
let viewMode: "list" | "grid" = "list";
let workspaceView: WorkspaceView = "library";
let inspectorTab: InspectorTab = "details";
let inspectorTabMotion: TabMotionDirection = "none";
let inspectorTabMotionSequence = 0;
let sidebarCollapsed = readStoredBoolean(sidebarCollapsedStorageKey, true);
let inspectorCollapsed = readStoredBoolean(inspectorCollapsedStorageKey, true);
const activityByFileId = new Map<string, InspectorAsyncState<FileActivityRecord[]>>();
const shareByFileId = new Map<string, ShareUiState>();
let toastTimer: number | null = null;

export function bootChemVaultFiles(): void {
  const shell = document.querySelector<HTMLElement>("[data-cv-shell]");
  if (!shell || shell.dataset.cvBooted === "true") return;

  shell.dataset.cvBooted = "true";
  setShellAuthState("checking");
  setAuthGateMessage("loading");
  bindEvents();
  updateSidePanels();
  renderAccountIdentity();
  void loadRemoteState();
}

function readStoredBoolean(key: string, fallback: boolean): boolean {
  try {
    const value = window.localStorage.getItem(key);
    if (value === "true") return true;
    if (value === "false") return false;
  } catch {
    return fallback;
  }
  return fallback;
}

function writeStoredBoolean(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, value ? "true" : "false");
  } catch {
    // State persistence is optional.
  }
}

function project(id: string, name: string, slug: string, sortOrder: number): ProjectRecord {
  const timestamp = "2026-06-11T00:00:00.000Z";
  return { id, name, slug, description: null, sortOrder, createdAt: timestamp, updatedAt: timestamp };
}

function folder(id: string, projectId: string, name: string, slug: string, path: string, parentId: string | null = null): FolderRecord {
  const timestamp = "2026-06-11T00:00:00.000Z";
  return { id, projectId, parentId, name, slug, path, createdAt: timestamp, updatedAt: timestamp };
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
    visibility: "public",
    roleIds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    tags,
  };
}

function bindEvents(): void {
  document.querySelector<HTMLButtonElement>("[data-cv-sidebar-toggle]")?.addEventListener("click", () => toggleSidebar());
  document.querySelector<HTMLButtonElement>("[data-cv-inspector-toggle]")?.addEventListener("click", () => toggleInspector());
  document.querySelector<HTMLButtonElement>("[data-cv-sidepanel-scrim]")?.addEventListener("click", () => closeFloatingSidePanels());
  window.addEventListener("resize", updateSidePanels);

  document.querySelector<HTMLFormElement>("[data-cv-search-form]")?.addEventListener("submit", (event) => event.preventDefault());
  document.querySelector<HTMLInputElement>("[data-cv-search-input]")?.addEventListener("input", (event) => {
    fileBrowserNotice = null;
    filters = { ...filters, search: (event.currentTarget as HTMLInputElement).value };
    renderFiles();
    renderInspector();
  });

  document.querySelector<HTMLElement>("[data-cv-workspace]")?.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const viewButton = target.closest<HTMLElement>("[data-cv-workspace-view-button]");
    if (viewButton) {
      workspaceView = nextWorkspaceView(workspaceView, viewButton.dataset.cvWorkspaceViewButton);
      updateWorkspaceView();
      return;
    }

    const historyButton = target.closest<HTMLButtonElement>("[data-cv-browser-history]");
    if (historyButton) {
      if (historyButton.disabled) return;
      navigateBrowserHistory(historyButton.dataset.cvBrowserHistory === "forward" ? 1 : -1);
      return;
    }

    const rootButton = target.closest<HTMLElement>("[data-cv-browser-root]");
    if (rootButton) {
      navigateToBrowserLocation({ projectId: null, folderId: null });
      return;
    }

    if (handleFolderDeleteClick(event, target.closest<HTMLElement>("[data-cv-delete-folder-id]"))) return;

    const browserFolder = target.closest<HTMLElement>("[data-cv-browser-folder-id]");
    if (browserFolder?.dataset.cvBrowserFolderId) {
      navigateToBrowserLocation({
        projectId: browserFolder.dataset.cvBrowserProjectId || filters.projectId,
        folderId: browserFolder.dataset.cvBrowserFolderId,
      });
      return;
    }

    const browserProject = target.closest<HTMLElement>("[data-cv-browser-project-id]");
    if (browserProject?.dataset.cvBrowserProjectId) {
      navigateToBrowserLocation({ projectId: browserProject.dataset.cvBrowserProjectId, folderId: null });
      return;
    }

    const browserFile = target.closest<HTMLElement>("[data-cv-browser-file-id]");
    if (browserFile?.dataset.cvBrowserFileId) {
      selectedFileId = browserFile.dataset.cvBrowserFileId;
      selectedFileIds = new Set([selectedFileId]);
      revealInspectorForSelection();
      workspaceView = "library";
      renderFiles();
      renderInspector();
      updateWorkspaceView();
      return;
    }

    const quickFilter = target.closest<HTMLElement>("[data-cv-quick-filter]");
    if (!quickFilter || target.closest("[data-cv-file-panel]")) return;
    const next = quickFilter.dataset.cvQuickFilter || null;
    filters = {
      ...filters,
      quickFilter: next === filters.quickFilter ? null : (next as FileQuickFilter | null),
    };
    fileBrowserNotice = null;
    workspaceView = "library";
    renderAll();
  });

  document.addEventListener("keydown", (event) => {
    const target = event.target as HTMLElement | null;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      document.querySelector<HTMLInputElement>("[data-cv-search-input]")?.focus();
    }
    if (event.key === "Escape" && !target?.closest("[data-cv-search-input]")) {
      closeAuthModal();
      closeRoleModal();
      closeUploadModal();
      closeFloatingSidePanels();
    }
  });

  const fileInput = document.querySelector<HTMLInputElement>("[data-cv-file-input]");
  const folderInput = document.querySelector<HTMLInputElement>("[data-cv-folder-input]");
  if (folderInput) {
    folderInput.setAttribute("webkitdirectory", "");
    folderInput.setAttribute("directory", "");
  }
  document.querySelector<HTMLButtonElement>("[data-cv-upload-button]")?.addEventListener("click", () => openUploadModal({ reset: true }));
  document.querySelector<HTMLButtonElement>("[data-cv-file-picker]")?.addEventListener("click", () => fileInput?.click());
  document.querySelector<HTMLButtonElement>("[data-cv-folder-picker]")?.addEventListener("click", () => folderInput?.click());
  document.querySelector<HTMLElement>("[data-cv-upload-modal]")?.addEventListener("change", (event) => {
    const target = event.target as HTMLInputElement | null;
    if (!target) return;
    if (target.matches("[data-cv-upload-visibility]")) {
      uploadVisibility = target.value === "public" && currentActorAccess.canManageRoles ? "public" : target.value === "roles" ? "roles" : "private";
      renderUploadAccessControls();
      return;
    }
    if (target.matches("[data-cv-upload-role]")) {
      const roleId = target.value;
      if (target.checked) uploadRoleIds.add(roleId);
      else uploadRoleIds.delete(roleId);
      renderUploadAccessControls();
    }
  });
  fileInput?.addEventListener("change", () => {
    void handleFiles(fileInput.files);
    fileInput.value = "";
  });
  folderInput?.addEventListener("change", () => {
    void handleFiles(folderInput.files);
    folderInput.value = "";
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
    void handleDroppedUploads(event.dataTransfer);
  });

  document.querySelector<HTMLElement>("[data-cv-sidebar]")?.addEventListener("click", (event) => {
    const nav = (event.target as HTMLElement).closest<HTMLElement>("[data-cv-nav='all-files']");
    if (!nav) return;
    event.preventDefault();
    fileBrowserNotice = null;
    filters = { search: filters.search, projectId: null, folderId: null, tagSlug: null, quickFilter: null };
    recordBrowserHistory({ projectId: null, folderId: null }, "push");
    selectedFileId = null;
    selectedFileIds = new Set();
    closeSidebarAfterCompactAction();
    renderAll();
  });

  document.querySelector<HTMLElement>("[data-cv-folder-tree]")?.addEventListener("click", (event) => {
    if (handleFolderDeleteClick(event, (event.target as HTMLElement).closest<HTMLElement>("[data-cv-delete-folder-id]"))) return;

    const projectToggle = (event.target as HTMLElement).closest<HTMLElement>("[data-cv-toggle-project-id]");
    if (projectToggle?.dataset.cvToggleProjectId) {
      event.preventDefault();
      event.stopPropagation();
      collapsedProjectIds = toggleCollapsedId(collapsedProjectIds, projectToggle.dataset.cvToggleProjectId);
      renderSidebar();
      return;
    }

    const folderToggle = (event.target as HTMLElement).closest<HTMLElement>("[data-cv-toggle-folder-id]");
    if (folderToggle?.dataset.cvToggleFolderId) {
      event.preventDefault();
      event.stopPropagation();
      collapsedFolderIds = toggleCollapsedId(collapsedFolderIds, folderToggle.dataset.cvToggleFolderId);
      renderSidebar();
      return;
    }

    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-cv-project-id], [data-cv-folder-id]");
    if (!target) return;
    event.preventDefault();
    navigateToBrowserLocation({
      projectId: target.dataset.cvProjectId || null,
      folderId: target.dataset.cvFolderId || null,
    });
  });

  document.querySelector<HTMLElement>("[data-cv-tags]")?.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-cv-tag-slug]");
    if (!target) return;
    filters = {
      ...filters,
      tagSlug: filters.tagSlug === target.dataset.cvTagSlug ? null : target.dataset.cvTagSlug || null,
    };
    fileBrowserNotice = null;
    closeSidebarAfterCompactAction();
    renderAll();
  });

  document.querySelector<HTMLElement>("[data-cv-active-filters]")?.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-cv-clear-filters]");
    if (!target) return;
    filters = { ...filters, tagSlug: null, quickFilter: null };
    fileBrowserNotice = null;
    renderAll();
  });

  document.querySelector<HTMLElement>("[data-cv-file-table-body]")?.addEventListener("click", (event) => {
    if (handleFolderDeleteClick(event, (event.target as HTMLElement).closest<HTMLElement>("[data-cv-delete-folder-id]"))) return;

    const row = (event.target as HTMLElement).closest<HTMLTableRowElement>("[data-cv-file-row]");
    if (!row) return;
    const kind = row.dataset.cvListKind ?? "file";
    if (kind !== "file") {
      navigateToBrowserLocation(
        {
          projectId: row.dataset.cvBrowserProjectId || null,
          folderId: row.dataset.cvBrowserFolderId || null,
        },
        { clearSelection: true }
      );
      return;
    }

    const checkbox = (event.target as HTMLElement).closest<HTMLInputElement>("input[type='checkbox']");
    if (checkbox) {
      toggleSelectedFile(row.dataset.cvFileId || null, checkbox.checked);
      revealInspectorForSelection();
      renderFiles();
      renderInspector();
      return;
    }

    selectedFileId = row.dataset.cvFileId || null;
    selectedFileIds = selectedFileId ? new Set([selectedFileId]) : new Set();
    revealInspectorForSelection();
    renderFiles();
    renderInspector();
  });

  document.querySelector<HTMLInputElement>("[data-cv-select-all]")?.addEventListener("change", (event) => {
    const checked = (event.currentTarget as HTMLInputElement).checked;
    const visibleFileIds = getSelectableVisibleFileIds();
    selectedFileIds = checked ? new Set(visibleFileIds) : new Set();
    selectedFileId = checked ? visibleFileIds[0] ?? null : null;
    revealInspectorForSelection();
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
      fileBrowserNotice = null;
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
      return;
    }
    if (target.closest("[data-cv-bulk-delete]")) {
      void deleteSelectedFiles();
    }
  });

  document.querySelector<HTMLElement>("[data-cv-inspector]")?.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (target.closest("[data-cv-inspector-close]")) {
      closeInspector();
      return;
    }

    const tabButton = target.closest<HTMLElement>("[data-cv-inspector-tab]");
    if (tabButton) {
      const nextTab = (tabButton.dataset.cvInspectorTab as InspectorTab) || "details";
      const transition = nextInspectorTabMotion(inspectorTab, nextTab, inspectorTabMotionSequence);
      inspectorTab = transition.tab;
      inspectorTabMotion = transition.direction;
      inspectorTabMotionSequence = transition.sequence;
      renderInspector();
      if (inspectorTab === "activity") void loadActivityForSelected();
      return;
    }

    if (target.closest("[data-cv-share-focus-button]")) {
      inspectorTab = "details";
      renderInspector();
      (document.querySelector("[data-cv-share-expiry]") as HTMLSelectElement | null)?.focus();
      return;
    }

    if (target.closest("[data-cv-copy-share]")) {
      void copySelectedShareLink();
      return;
    }

    const managedCopy = target.closest<HTMLElement>("[data-cv-copy-managed-share]");
    if (managedCopy?.dataset.cvShareToken) {
      void copyManagedShareLink(managedCopy.dataset.cvShareToken);
      return;
    }

    const managedDelete = target.closest<HTMLElement>("[data-cv-delete-share]");
    if (managedDelete?.dataset.cvShareToken) {
      void deleteManagedShare(managedDelete.dataset.cvShareToken);
    }
  });

  document.querySelector<HTMLElement>("[data-cv-inspector]")?.addEventListener("submit", (event) => {
    const form = (event.target as HTMLElement).closest<HTMLFormElement>("[data-cv-share-form]");
    if (form) {
      event.preventDefault();
      void createShareForSelected(form);
      return;
    }

    const updateForm = (event.target as HTMLElement).closest<HTMLFormElement>("[data-cv-share-update-form]");
    if (updateForm) {
      event.preventDefault();
      void updateManagedShare(updateForm);
    }
  });

  document.querySelector<HTMLElement>("[data-cv-inspector]")?.addEventListener("change", (event) => {
    const expirySelect = (event.target as HTMLElement).closest("[data-cv-share-expiry]") as HTMLSelectElement | null;
    if (expirySelect) syncShareCustomExpiry(expirySelect);
  });

  document.querySelector<HTMLElement>("[data-cv-role-modal]")?.addEventListener("submit", (event) => {
    const form = (event.target as HTMLElement).closest<HTMLFormElement>("[data-cv-role-form]");
    if (!form) return;
    event.preventDefault();
    void saveRoleSettings(form);
  });

  document.querySelector<HTMLElement>("[data-cv-account-button]")?.addEventListener("click", openAuthModal);
  document.querySelector<HTMLElement>("[data-cv-role-button]")?.addEventListener("click", openRoleModal);
  document.querySelector<HTMLButtonElement>("[data-cv-logout-button]")?.addEventListener("click", () => {
    void signOutCurrentUser();
  });
  document.querySelectorAll<HTMLElement>("[data-cv-auth-close]").forEach((element) => element.addEventListener("click", closeAuthModal));
  document.querySelectorAll<HTMLElement>("[data-cv-role-close]").forEach((element) => element.addEventListener("click", closeRoleModal));
  document.querySelectorAll<HTMLElement>("[data-cv-upload-close]").forEach((element) => element.addEventListener("click", closeUploadModal));

  document.querySelector<HTMLButtonElement>("[data-cv-download-button]")?.addEventListener("click", () => {
    if (!selectedFileId) return;
    window.location.href = `/api/files/${encodeURIComponent(selectedFileId)}/download`;
  });

  document.querySelector<HTMLButtonElement>("[data-cv-delete-button]")?.addEventListener("click", () => {
    if (!selectedFileId) return;
    void deleteSelectedFile();
  });
}

function handleFolderDeleteClick(event: Event, deleteButton: HTMLElement | null): boolean {
  const folderId = deleteButton?.dataset.cvDeleteFolderId;
  if (!folderId) return false;
  event.preventDefault();
  event.stopPropagation();
  void deleteFolder(folderId);
  return true;
}

function navigateToBrowserLocation(location: BrowserLocationState, options: { clearSelection?: boolean; history?: "push" | "replace" | "none" } = {}): void {
  fileBrowserNotice = null;
  const nextLocation = normalizeBrowserLocation(location);
  filters = {
    ...filters,
    projectId: nextLocation.projectId,
    folderId: nextLocation.folderId,
  };
  if (options.clearSelection ?? true) {
    selectedFileId = null;
    selectedFileIds = new Set();
  }
  if (options.history !== "none") {
    recordBrowserHistory(nextLocation, options.history ?? "push");
  }
  workspaceView = "library";
  closeSidebarAfterCompactAction();
  renderAll();
}

function navigateBrowserHistory(direction: 1 | -1): void {
  const nextIndex = browserHistoryIndex + direction;
  if (nextIndex < 0 || nextIndex >= browserHistory.length) return;
  browserHistoryIndex = nextIndex;
  navigateToBrowserLocation(browserHistory[browserHistoryIndex], { history: "none", clearSelection: true });
}

function recordBrowserHistory(location: BrowserLocationState, mode: "push" | "replace"): void {
  const nextLocation = normalizeBrowserLocation(location);
  const currentLocation = browserHistory[browserHistoryIndex] ?? { projectId: null, folderId: null };
  if (mode === "replace") {
    browserHistory[browserHistoryIndex] = nextLocation;
    return;
  }
  if (browserLocationsEqual(currentLocation, nextLocation)) return;
  browserHistory = browserHistory.slice(0, browserHistoryIndex + 1);
  browserHistory.push(nextLocation);
  browserHistoryIndex = browserHistory.length - 1;
}

function normalizeBrowserLocation(location: BrowserLocationState): BrowserLocationState {
  if (!location.folderId) {
    return { projectId: location.projectId, folderId: null };
  }
  const folderRecord = library.folders.find((entry) => entry.id === location.folderId) ?? null;
  return {
    projectId: folderRecord?.projectId ?? location.projectId,
    folderId: location.folderId,
  };
}

function browserLocationsEqual(left: BrowserLocationState, right: BrowserLocationState): boolean {
  return left.projectId === right.projectId && left.folderId === right.folderId;
}

async function loadRemoteState(): Promise<void> {
  setShellAuthState("checking");
  setAuthGateMessage("loading");

  try {
    const health = await fetchJson<HealthResponse>(authAwareApiUrl("/api/health"));
    configurationMissing = health.status !== "ready";
    healthEnvironment = health.environment || "local";
    authStatus = health.authStatus || (health.actorAccess ? "authenticated" : "unauthenticated");
    currentLoginUrl = health.loginUrl || userLoginUrl(window.location.href);
    currentActorEmail = normalizeActorEmail(health.actorEmail, "");
    currentActorAccess = normalizeActorAccess(health.actorAccess, currentActorEmail);
    renderAccountIdentity();
    renderHealth(health);
    if (authStatus === "unauthenticated" && healthEnvironment === "production" && currentLoginUrl) {
      setAuthGateMessage("loading");
      setShellAuthState("redirecting");
      window.location.replace(currentLoginUrl);
      return;
    }
  } catch {
    configurationMissing = true;
    authStatus = "unauthenticated";
    currentLoginUrl = userLoginUrl(window.location.href);
    previewMode = true;
    setAuthGateMessage("loading");
    renderHealth();
  }

  if (!canReadCurrentAccess()) {
    library = createInitialLibrary(emptyLibrary);
    uploadQueue = [];
    libraryLoading = false;
    selectedFileId = null;
    selectedFileIds = new Set();
    renderAll();
    setShellAuthState("ready");
    return;
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
  setShellAuthState("ready");
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

function authAwareApiUrl(path: string): string {
  const url = new URL(path, window.location.origin);
  url.searchParams.set("returnTo", window.location.href);
  return `${url.pathname}${url.search}`;
}

function readErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const error = (payload as { error?: { message?: unknown } }).error;
  return typeof error?.message === "string" ? error.message : null;
}

function renderAll(): void {
  updateSidePanels();
  renderAccountIdentity();
  renderSidebar();
  renderInsights();
  renderWorkspaceBoards();
  renderQueue();
  renderFiles();
  renderInspector();
  updateWorkspaceView();
}

function toggleSidebar(): void {
  sidebarCollapsed = nextSidePanelCollapsed(sidebarCollapsed, "toggle");
  writeStoredBoolean(sidebarCollapsedStorageKey, sidebarCollapsed);
  updateSidePanels();
}

function toggleInspector(): void {
  inspectorCollapsed = nextSidePanelCollapsed(inspectorCollapsed, "toggle");
  writeStoredBoolean(inspectorCollapsedStorageKey, inspectorCollapsed);
  updateSidePanels();
}

function closeFloatingSidePanels(): void {
  let changed = false;
  if (!sidebarCollapsed) {
    sidebarCollapsed = nextSidePanelCollapsed(sidebarCollapsed, "close");
    writeStoredBoolean(sidebarCollapsedStorageKey, sidebarCollapsed);
    changed = true;
  }
  if (!inspectorCollapsed) {
    inspectorCollapsed = nextSidePanelCollapsed(inspectorCollapsed, "close");
    writeStoredBoolean(inspectorCollapsedStorageKey, inspectorCollapsed);
    changed = true;
  }
  if (changed) updateSidePanels();
}

function closeSidebarAfterCompactAction(): void {
  if (!isFloatingSidePanelLayout() || sidebarCollapsed) return;
  sidebarCollapsed = nextSidePanelCollapsed(sidebarCollapsed, "close");
  writeStoredBoolean(sidebarCollapsedStorageKey, sidebarCollapsed);
}

function isFloatingSidePanelLayout(): boolean {
  return window.matchMedia?.("(max-width: 1100px)").matches ?? false;
}

function updateSidePanels(): void {
  const shell = document.querySelector<HTMLElement>("[data-cv-shell]");
  const sidebar = document.querySelector<HTMLElement>("[data-cv-sidebar]");
  const inspector = document.querySelector<HTMLElement>("[data-cv-inspector]");
  const sidebarToggle = document.querySelector<HTMLButtonElement>("[data-cv-sidebar-toggle]");
  const inspectorToggle = document.querySelector<HTMLButtonElement>("[data-cv-inspector-toggle]");
  const scrim = document.querySelector<HTMLButtonElement>("[data-cv-sidepanel-scrim]");
  const floating = isFloatingSidePanelLayout();

  shell?.setAttribute("data-cv-sidebar-collapsed", sidebarCollapsed ? "true" : "false");
  shell?.setAttribute("data-cv-inspector-collapsed", inspectorCollapsed ? "true" : "false");
  shell?.setAttribute("data-cv-sidepanel-layout", floating ? "floating" : "docked");

  sidebar?.setAttribute("aria-expanded", sidebarCollapsed ? "false" : "true");
  sidebar?.setAttribute("data-cv-sidebar-state", sidebarCollapsed ? "collapsed" : "expanded");

  inspector?.setAttribute("aria-hidden", inspectorCollapsed ? "true" : "false");
  inspector?.toggleAttribute("inert", inspectorCollapsed);

  if (sidebarToggle) {
    sidebarToggle.setAttribute("aria-expanded", sidebarCollapsed ? "false" : "true");
    sidebarToggle.setAttribute("aria-label", sidebarCollapsed ? "Open Library sidebar" : "Close Library sidebar");
    sidebarToggle.classList.toggle("is-active", !sidebarCollapsed);
  }
  if (inspectorToggle) {
    inspectorToggle.setAttribute("aria-expanded", inspectorCollapsed ? "false" : "true");
    inspectorToggle.setAttribute("aria-label", inspectorCollapsed ? "Open file inspector" : "Close file inspector");
    inspectorToggle.classList.toggle("is-active", !inspectorCollapsed);
  }
  if (scrim) {
    scrim.hidden = !floating || (sidebarCollapsed && inspectorCollapsed);
  }
}

function showToast(message: string, tone: "success" | "error" = "success"): void {
  const region = document.querySelector<HTMLElement>("[data-cv-toast-region]");
  if (!region) return;
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  region.innerHTML = `<div class="toast toast--${tone}" role="status">${escapeHtml(message)}</div>`;
  toastTimer = window.setTimeout(() => {
    region.querySelector<HTMLElement>(".toast")?.setAttribute("data-cv-toast-state", "closing");
    toastTimer = window.setTimeout(() => {
      region.innerHTML = "";
      toastTimer = null;
    }, 180);
  }, toastDurationMs);
}

function setShellAuthState(state: ShellAuthState): void {
  const shell = document.querySelector<HTMLElement>("[data-cv-shell]");
  if (!shell) return;
  shell.dataset.cvAuthState = state;
  shell.setAttribute("aria-busy", state === "ready" ? "false" : "true");
}

function setAuthGateMessage(message: string): void {
  document.querySelectorAll<HTMLElement>("[data-cv-auth-gate-message]").forEach((element) => {
    element.textContent = message;
  });
}

function renderAccountIdentity(): void {
  const authenticated = authStatus === "authenticated" || authStatus === "forbidden";
  const email = authenticated ? normalizeActorEmail(currentActorEmail, "") : "";
  const label = email || (authStatus === "forbidden" ? "No file access" : "Sign in required");
  const initials = email ? initialsForEmail(email) : "CV";
  document.querySelectorAll<HTMLElement>("[data-cv-account-avatar], [data-cv-auth-avatar]").forEach((element) => {
    element.textContent = initials;
  });
  document.querySelectorAll<HTMLElement>("[data-cv-account-email]").forEach((element) => {
    element.textContent = label;
    element.title = email || label;
  });
  const footerAccountLabel = authenticated
    ? email || (authStatus === "forbidden" ? "ChemVault User verified" : "Signed in")
    : "Sign in required";
  const footerAccessLabel = authenticated
    ? authStatus === "forbidden"
      ? "No file access"
      : `${currentActorAccess.roleName} · ${permissionLabel(currentActorAccess.permission)}`
    : "ChemVault User required";
  document.querySelectorAll<HTMLElement>("[data-cv-footer-account]").forEach((element) => {
    element.textContent = footerAccountLabel;
    element.title = email || footerAccountLabel;
  });
  document.querySelectorAll<HTMLElement>("[data-cv-footer-access]").forEach((element) => {
    element.textContent = footerAccessLabel;
    element.title = footerAccessLabel;
  });
  document.querySelectorAll<HTMLInputElement>("[data-cv-auth-email]").forEach((element) => {
    element.value = email;
  });
  document.querySelectorAll<HTMLAnchorElement>("[data-cv-login-link]").forEach((element) => {
    element.href = currentLoginUrl || userLoginUrl(window.location.href);
  });
  document.querySelectorAll<HTMLElement>("[data-cv-authenticated-only]").forEach((element) => {
    element.hidden = !authenticated;
  });
  document.querySelectorAll<HTMLElement>("[data-cv-unauthenticated-only]").forEach((element) => {
    element.hidden = authenticated;
  });
  document.querySelectorAll<HTMLElement>("[data-cv-role-nav-permission]").forEach((element) => {
    element.textContent = permissionLabel(currentActorAccess.permission);
  });
  renderRoleSettings();
  renderUploadAccessControls();
  renderPermissionControls();
}

function renderPermissionControls(): void {
  const canWrite = canWriteCurrentAccess();
  const uploadButton = document.querySelector<HTMLButtonElement>("[data-cv-upload-button]");
  if (uploadButton) {
    uploadButton.disabled = !canWrite;
    uploadButton.title = canWrite ? "" : "Current role is read-only or no-read.";
  }
  const roleSection = document.querySelector<HTMLElement>("[data-cv-role-section]");
  if (roleSection) roleSection.hidden = !currentActorAccess.canManageRoles;
}

function renderRoleSettings(): void {
  const container = document.querySelector<HTMLElement>("[data-cv-role-settings]");
  if (!container) return;
  if (roleSettingsState.loading) {
    container.innerHTML = `<div class="role-settings__empty">Loading role permissions...</div>`;
    return;
  }
  const roles = visibleRolePolicies();
  const canManage = currentActorAccess.canManageRoles;
  const rows = roles.map((role) => renderRolePermissionRow(role, canManage)).join("");
  container.innerHTML = `
    <form class="role-settings__form" data-cv-role-form>
      <header>
        <div>
          <strong>Role permissions</strong>
          <span>${escapeHtml(currentActorAccess.roleName)} · ${escapeHtml(permissionLabel(currentActorAccess.permission))}</span>
        </div>
      </header>
      <div class="role-settings__rows">${rows}</div>
      ${roleSettingsState.error ? `<p class="form-status form-status--error">${escapeHtml(roleSettingsState.error)}</p>` : ""}
      ${roleSettingsState.message ? `<p class="form-status">${escapeHtml(roleSettingsState.message)}</p>` : ""}
      <button class="button button--secondary button--wide" type="submit" ${canManage && !roleSettingsState.saving ? "" : "disabled"}>${roleSettingsState.saving ? "Saving" : "Save role permissions"}</button>
    </form>
  `;
}

function renderRolePermissionRow(role: FileRolePolicy, canManage: boolean): string {
  const disabled = !canManage || role.scope === "owner";
  const active = role.id === currentActorAccess.roleId;
  return `
    <label class="role-permission-row${active ? " is-active" : ""}">
      <span>
        <strong>${escapeHtml(role.name)}</strong>
        <small>${escapeHtml(roleDescription(role))}</small>
      </span>
      <select name="permission:${escapeAttr(role.id)}" data-cv-role-permission data-cv-role-id="${escapeAttr(role.id)}" ${disabled ? "disabled" : ""}>
        ${permissionOption("none", role.permission)}
        ${permissionOption("read", role.permission)}
        ${permissionOption("write", role.permission)}
      </select>
    </label>
  `;
}

function permissionOption(value: FilePermissionLevel, selected: FilePermissionLevel): string {
  return `<option value="${value}" ${value === selected ? "selected" : ""}>${escapeHtml(permissionLabel(value))}</option>`;
}

function renderUploadAccessControls(): void {
  const container = document.querySelector<HTMLElement>("[data-cv-upload-access]");
  if (!container) return;
  syncUploadRoleSelection();
  const roles = selectableUploadRolePolicies();
  const roleControls = roles
    .map((role) => {
      const checked = uploadRoleIds.has(role.id);
      const disabled = uploadVisibility !== "roles";
      return `
        <label class="upload-access-role">
          <input type="checkbox" value="${escapeAttr(role.id)}" data-cv-upload-role ${checked ? "checked" : ""} ${disabled ? "disabled" : ""} />
          <span>
            <strong>${escapeHtml(role.name)}</strong>
            <small>${escapeHtml(roleDescription(role))}</small>
          </span>
        </label>
      `;
    })
    .join("");

  container.innerHTML = `
    <header>
      <div>
        <strong>File access</strong>
        <span>${currentActorAccess.canManageRoles ? "Files are private by default. Admins can publish files or choose any file role." : "Files are private by default. You can keep uploads private or limit them to your current role."}</span>
      </div>
    </header>
    <div class="upload-access-modes">
      <label>
        <input type="radio" name="uploadVisibility" value="private" data-cv-upload-visibility ${uploadVisibility === "private" ? "checked" : ""} />
        <span>Private</span>
      </label>
      ${
        currentActorAccess.canManageRoles
          ? `<label>
        <input type="radio" name="uploadVisibility" value="public" data-cv-upload-visibility ${uploadVisibility === "public" ? "checked" : ""} />
        <span>Public</span>
      </label>`
          : ""
      }
      <label>
        <input type="radio" name="uploadVisibility" value="roles" data-cv-upload-visibility ${uploadVisibility === "roles" ? "checked" : ""} />
        <span>Selected roles</span>
      </label>
    </div>
    <div class="upload-access-roles">${roleControls || `<div class="role-settings__empty">No file roles are available.</div>`}</div>
  `;
}

function renderHealth(health?: HealthResponse): void {
  const band = document.querySelector<HTMLElement>("[data-cv-status-band]");
  if (!band) return;

  const isReady = health?.status === "ready";
  const authLabel =
    health?.authStatus === "authenticated"
      ? "User signed in"
      : health?.authStatus === "forbidden"
        ? "No file access"
        : "Sign in required";
  const authState = health?.authStatus === "authenticated" ? "online" : "warning";
  const items = [
    { label: authLabel, state: authState, icon: true },
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
          <span class="status-item__text">${escapeHtml(item.label)}</span>
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

function renderWorkspaceBoards(): void {
  renderFlowBoard();
  renderInsightsBoard();
}

function renderFlowBoard(): void {
  const lanes = document.querySelector<HTMLElement>("[data-cv-flow-lanes]");
  const timeline = document.querySelector<HTMLElement>("[data-cv-flow-timeline]");
  if (libraryLoading) {
    if (lanes) {
      lanes.innerHTML = [
        flowLane("Intake", "Loading", "Reading library", 0, "blue"),
        flowLane("Indexed", "Loading", "Reading D1", 0, "green"),
        flowLane("Review", "Loading", "Checking uploads", 0, "amber"),
        flowLane("Released", "Loading", "Checking access", 0, "teal"),
      ].join("");
    }
    if (timeline) timeline.innerHTML = `<li class="flow-empty">Loading activity...</li>`;
    return;
  }

  const activeFiles = library.files.filter((entry) => entry.status !== "deleted");
  const summary = summarizeFiles(activeFiles);
  const total = Math.max(activeFiles.length, 1);
  const releasedCount = activeFiles.filter((entry) => entry.visibility === "public" || entry.roleIds.length > 0).length;

  if (lanes) {
    lanes.innerHTML = [
      flowLane("Intake", String(activeFiles.length), "Files in vault", (activeFiles.length / total) * 100, "blue"),
      flowLane("Indexed", String(summary.readyCount), "Ready R2 objects", (summary.readyCount / total) * 100, "green"),
      flowLane("Needs review", String(summary.failedCount), "Failed or blocked", (summary.failedCount / total) * 100, "amber"),
      flowLane("Released", String(releasedCount), "Access policy set", (releasedCount / total) * 100, "teal"),
    ].join("");
  }

  if (timeline) {
    const latestFiles = sortFiles(activeFiles, { key: "modified", direction: "desc" }).slice(0, 5);
    timeline.innerHTML = latestFiles.length
      ? latestFiles.map((fileRecord) => flowTimelineItem(fileRecord)).join("")
      : `<li class="flow-empty">No recent file activity.</li>`;
  }
}

function flowLane(label: string, value: string, detail: string, progress: number, tone: "blue" | "green" | "amber" | "teal"): string {
  const width = Math.max(5, Math.min(100, Math.round(progress)));
  return `
    <article class="flow-lane flow-lane--${tone}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(detail)}</small>
      <div class="flow-lane__meter" aria-hidden="true"><span style="width: ${width}%"></span></div>
    </article>
  `;
}

function flowTimelineItem(fileRecord: FileRecord): string {
  const isFailed = fileRecord.status === "failed";
  return `
    <li class="flow-event${isFailed ? " flow-event--warning" : ""}">
      <span class="flow-event__dot"></span>
      <div>
        <strong>${escapeHtml(fileRecord.displayName)}</strong>
        <small>${escapeHtml(typeLabel(fileRecord))} · ${formatBytes(fileRecord.sizeBytes)} · ${escapeHtml(formatDate(fileRecord.updatedAt))}</small>
      </div>
      <span>${isFailed ? "Review" : "Indexed"}</span>
    </li>
  `;
}

function renderInsightsBoard(): void {
  const container = document.querySelector<HTMLElement>("[data-cv-insights-board]");
  if (!container) return;
  if (libraryLoading) {
    container.innerHTML = `<div class="insight-board-empty">Loading vault intelligence...</div>`;
    return;
  }

  const activeFiles = library.files.filter((entry) => entry.status !== "deleted");
  const summary = summarizeFiles(activeFiles);
  const projectRows = projectStorageRows(activeFiles);
  const tagRows = tagDistributionRows(activeFiles);
  const readyState = configurationMissing ? "Needs config" : "Ready";

  container.innerHTML = `
    <section class="storage-map" aria-label="Storage by project">
      <header>
        <h3>Project storage</h3>
        <span>${formatBytes(summary.totalBytes)}</span>
      </header>
      <div>${projectRows || `<p class="insight-board-empty">No project storage yet.</p>`}</div>
    </section>
    <section class="tag-distribution" aria-label="Tag distribution">
      <header>
        <h3>Tag distribution</h3>
        <span>${tagRows ? "Top tags" : "No tags"}</span>
      </header>
      <div>${tagRows || `<p class="insight-board-empty">Tags appear after files are indexed.</p>`}</div>
    </section>
    <section class="readiness-grid" aria-label="Vault readiness">
      ${readinessCard("Access", canReadCurrentAccess() ? "Readable" : "No read", canReadCurrentAccess() ? "green" : "amber")}
      ${readinessCard("Write policy", canWriteCurrentAccess() ? "Writable" : "Read only", canWriteCurrentAccess() ? "blue" : "amber")}
      ${readinessCard("Index", readyState, configurationMissing ? "amber" : "green")}
      ${readinessCard("Review", `${summary.failedCount} flagged`, summary.failedCount > 0 ? "amber" : "teal")}
    </section>
  `;
}

function projectStorageRows(files: FileRecord[]): string {
  const totalBytes = files.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  return library.projects
    .map((projectRecord) => {
      const projectBytes = files.filter((entry) => entry.projectId === projectRecord.id).reduce((sum, entry) => sum + entry.sizeBytes, 0);
      return { projectRecord, projectBytes };
    })
    .filter((entry) => entry.projectBytes > 0)
    .sort((a, b) => b.projectBytes - a.projectBytes)
    .slice(0, 5)
    .map((entry) => {
      const width = totalBytes > 0 ? Math.max(3, Math.round((entry.projectBytes / totalBytes) * 100)) : 0;
      return `
        <article class="storage-map__row">
          <div>
            <strong>${escapeHtml(entry.projectRecord.name)}</strong>
            <span>${formatBytes(entry.projectBytes)}</span>
          </div>
          <div class="meter" aria-hidden="true"><span style="width: ${width}%"></span></div>
        </article>
      `;
    })
    .join("");
}

function tagDistributionRows(files: FileRecord[]): string {
  const counts = new Map<string, number>();
  files.forEach((fileRecord) => {
    fileRecord.tags.forEach((tagRecord) => counts.set(tagRecord.name, (counts.get(tagRecord.name) ?? 0) + 1));
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([name, count]) => `<span class="tag-signal"><strong>${escapeHtml(name)}</strong><em>${count}</em></span>`)
    .join("");
}

function readinessCard(label: string, value: string, tone: "blue" | "green" | "amber" | "teal"): string {
  return `
    <article class="readiness-card readiness-card--${tone}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `;
}

function updateWorkspaceView(): void {
  const workspace = document.querySelector<HTMLElement>("[data-cv-workspace]");
  workspace?.setAttribute("data-cv-workspace-active", workspaceView);
  document.querySelectorAll<HTMLElement>("[data-cv-workspace-view-button]").forEach((button) => {
    const isActive = button.dataset.cvWorkspaceViewButton === workspaceView;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  document.querySelectorAll<HTMLElement>("[data-cv-workspace-view]").forEach((panel) => {
    const isActive = panel.dataset.cvWorkspaceView === workspaceView;
    panel.hidden = !isActive;
    panel.classList.toggle("is-active", isActive);
  });
}

function renderSidebar(): void {
  const folderTree = document.querySelector<HTMLElement>("[data-cv-folder-tree]");
  const tagsContainer = document.querySelector<HTMLElement>("[data-cv-tags]");
  const allFilesLink = document.querySelector<HTMLElement>("[data-cv-nav='all-files']");
  const allFilesCount = document.querySelector<HTMLElement>("[data-cv-all-files-count]");
  if (allFilesLink) {
    const isAllFiles = !filters.projectId && !filters.folderId && !filters.tagSlug && !filters.quickFilter;
    allFilesLink.setAttribute("aria-current", isAllFiles ? "page" : "false");
  }
  if (allFilesCount) {
    allFilesCount.textContent = String(library.files.filter((entry) => entry.status !== "deleted").length);
  }
  if (folderTree) {
    folderTree.innerHTML = library.projects.map((projectRecord) => renderProject(projectRecord)).join("");
  }
  if (tagsContainer) {
    tagsContainer.innerHTML = library.tags.map((tagRecord) => renderTagButton(tagRecord)).join("");
  }
}

function renderProject(projectRecord: ProjectRecord): string {
  const count = library.files.filter((entry) => entry.projectId === projectRecord.id && entry.status !== "deleted").length;
  const isActive = filters.projectId === projectRecord.id && !filters.folderId;
  const childNodes = buildFolderTree(projectRecord.id, library.folders, library.files);
  const hasChildren = childNodes.length > 0;
  const isExpanded = isTreeNodeExpanded(collapsedProjectIds, projectRecord.id);
  const children = childNodes.map((node) => renderFolderNode(projectRecord.id, node)).join("");

  return `
    <li>
      <div class="folder-row-shell">
        ${hasChildren ? renderTreeToggle("project", projectRecord.id, projectRecord.name, isExpanded) : renderTreeTogglePlaceholder()}
        <a class="folder-row${isActive ? " is-active" : ""}" href="#" data-cv-project-id="${escapeAttr(projectRecord.id)}">
          ${folderIcon()}
          <span>${escapeHtml(projectRecord.name)}</span>
          <strong>${count}</strong>
        </a>
      </div>
      ${hasChildren ? `<div class="folder-children" data-cv-expanded="${isExpanded ? "true" : "false"}"><ul>${children}</ul></div>` : ""}
    </li>
  `;
}

function renderFolderNode(projectId: string, node: ReturnType<typeof buildFolderTree>[number]): string {
  const hasChildren = node.children.length > 0;
  const isExpanded = isTreeNodeExpanded(collapsedFolderIds, node.folder.id);
  const canDelete = canDeleteFolderNode();
  return `
    <li>
      <div class="folder-row-wrap${canDelete ? " folder-row-wrap--deletable" : ""}">
        <div class="folder-row-shell folder-row-shell--child" style="--folder-depth: ${node.depth}">
          ${hasChildren ? renderTreeToggle("folder", node.folder.id, node.folder.name, isExpanded) : renderTreeTogglePlaceholder()}
          <a class="folder-row folder-row--child${filters.folderId === node.folder.id ? " is-active" : ""}" href="#" data-cv-project-id="${escapeAttr(projectId)}" data-cv-folder-id="${escapeAttr(node.folder.id)}">
            ${folderIcon()}
            <span>${escapeHtml(node.folder.name)}</span>
            <strong>${node.totalFileCount}</strong>
          </a>
        </div>
        ${
          canDelete
            ? renderFolderDeleteButton(node.folder.id, node.folder.name, "folder-delete-button")
            : ""
        }
      </div>
      ${hasChildren ? `<div class="folder-children" data-cv-expanded="${isExpanded ? "true" : "false"}"><ul>${node.children.map((child) => renderFolderNode(projectId, child)).join("")}</ul></div>` : ""}
    </li>
  `;
}

function renderTreeToggle(kind: "project" | "folder", id: string, name: string, isExpanded: boolean): string {
  const dataAttribute = kind === "project" ? "data-cv-toggle-project-id" : "data-cv-toggle-folder-id";
  const action = isExpanded ? "Collapse" : "Expand";
  return `
    <button class="folder-toggle" type="button" aria-expanded="${isExpanded ? "true" : "false"}" aria-label="${action} ${escapeAttr(name)}" ${dataAttribute}="${escapeAttr(id)}">
      ${chevronIcon("down")}
    </button>
  `;
}

function renderTreeTogglePlaceholder(): string {
  return `<span class="folder-toggle folder-toggle--placeholder" aria-hidden="true">${chevronIcon("right")}</span>`;
}

function canDeleteFolderNode(): boolean {
  return canWriteCurrentAccess();
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
      const isPending = item.status === "pending";
      const isQueued = item.status === "queued";
      const isUploading = item.status === "uploading";
      const isComplete = item.status === "complete";
      const isFailed = item.status === "failed";
      const statusText = isFailed
        ? item.message || "Failed"
        : isComplete
          ? "Completed"
          : isPending
            ? "Pending"
            : isQueued
              ? "Queued"
              : `${item.progress}%`;
      const detailText = item.message || (isPending ? "Waiting to start" : isQueued ? "Preparing" : isUploading ? "Uploading" : "");
      const statusMarkup = isComplete
        ? `<span class="upload-row__status upload-row__status--complete">${checkIcon()}<span>${escapeHtml(statusText)}</span></span>`
        : `<span class="upload-row__status${isFailed ? " upload-row__status--failed" : ""}"><span class="upload-row__status-text">${escapeHtml(statusText)}</span>${
            detailText ? `<small>${escapeHtml(detailText)}</small>` : ""
          }</span>`;
      return `
        <li class="upload-row upload-row--${escapeAttr(item.status)}${isFailed ? " is-failed" : ""}" data-cv-upload-row>
          <span class="file-type-icon" data-ext="${escapeAttr(ext)}">${escapeHtml(ext)}</span>
          <span class="upload-row__name">${escapeHtml(item.name)}</span>
          <span class="upload-row__size">${formatBytes(item.sizeBytes)}</span>
          ${
            isComplete
              ? `<span class="upload-row__bar upload-row__bar--complete" aria-hidden="true"><span></span></span>`
              : `<span class="progress" role="progressbar" aria-valuenow="${item.progress}" aria-valuemin="0" aria-valuemax="100"><span style="width: ${item.progress}%"></span></span>`
          }
          ${statusMarkup}
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
  const listRegion = document.querySelector<HTMLElement>("[data-cv-list-region]");
  const fileBrowserGrid = document.querySelector<HTMLElement>("[data-cv-file-browser-grid]");
  const selectionSummary = document.querySelector<HTMLElement>("[data-cv-selection-summary]");
  const pageSummary = document.querySelector<HTMLElement>("[data-cv-page-summary]");
  const bulkBar = document.querySelector<HTMLElement>("[data-cv-bulk-bar]");
  const bulkSummary = document.querySelector<HTMLElement>("[data-cv-bulk-summary]");
  const selectAll = document.querySelector<HTMLInputElement>("[data-cv-select-all]");
  const sortedListItems = viewMode === "list" ? getBrowserItemsForListView() : buildFileBrowserItems(library, filters);
  const visibleFileItems = sortedListItems.filter((entry): entry is FileBrowserItem & { kind: "file" } => entry.kind === "file");
  const visibleFiles = visibleFileItems.map((entry) => entry.file);
  const visibleIds = new Set(visibleFiles.map((entry) => entry.id));

  selectedFileIds = new Set(Array.from(selectedFileIds).filter((id) => visibleIds.has(id)));

  if (selectedFileId && !visibleIds.has(selectedFileId)) {
    selectedFileId = selectedFileIds.values().next().value ?? visibleFiles[0]?.id ?? null;
  }
  if (!selectedFileId) {
    selectedFileId = selectedFileIds.values().next().value ?? visibleFiles[0]?.id ?? null;
  }

  if (filesTitle) filesTitle.textContent = libraryLoading ? "Files" : `Items (${sortedListItems.length})`;
  if (selectionSummary) selectionSummary.textContent = selectedFileIds.size ? `${selectedFileIds.size} selected` : "No files checked";
  if (pageSummary)
    pageSummary.textContent = libraryLoading
      ? "Loading"
      : sortedListItems.length
        ? `1-${Math.min(50, sortedListItems.length)} of ${sortedListItems.length}`
        : "0 files";
  if (activeFilters) activeFilters.innerHTML = renderActiveFilters();
  if (bulkBar) bulkBar.hidden = selectedFileIds.size === 0;
  if (bulkSummary) bulkSummary.textContent = selectedFileIds.size === 1 ? "1 file selected" : `${selectedFileIds.size} files selected`;
  if (selectAll) {
    const visibleFileIds = visibleFileItems.map((entry) => entry.id);
    selectAll.checked = visibleFileIds.length > 0 && visibleFileIds.every((entryId) => selectedFileIds.has(entryId));
    selectAll.indeterminate = selectedFileIds.size > 0 && !selectAll.checked;
  }
  updateSortButtons();
  updateQuickFilterButtons();
  updateViewModeButtons();
  renderFileBrowser();

  const isGridView = viewMode === "grid";
  if (fileBrowserGrid) fileBrowserGrid.hidden = !isGridView;
  if (listRegion) listRegion.hidden = isGridView;

  if (body && !listRegion?.hidden) {
    body.innerHTML = libraryLoading
      ? `<tr><td colspan="8"><div class="empty-state">Loading file index...</div></td></tr>`
      : sortedListItems.length
        ? sortedListItems.map((item) => renderFileListRow(item)).join("")
        : `<tr><td colspan="8"><div class="empty-state">${escapeHtml(emptyFilesLabel())}</div></td></tr>`;
  }
}

function renderFileBrowser(): void {
  const path = document.querySelector<HTMLElement>("[data-cv-file-browser-path]");
  const summary = document.querySelector<HTMLElement>("[data-cv-file-browser-summary]");
  const grid = document.querySelector<HTMLElement>("[data-cv-file-browser-grid]");
  updateBrowserHistoryButtons();
  if (path) path.innerHTML = renderFileBrowserPath();
  if (summary) {
    const notice = libraryLoading ? null : fileBrowserNotice;
    summary.textContent = libraryLoading ? "Loading" : notice?.message ?? fileBrowserSummary();
    summary.classList.toggle("file-browser__summary--info", notice?.tone === "info");
    summary.classList.toggle("file-browser__summary--error", notice?.tone === "error");
  }
  if (!grid) return;

  if (libraryLoading) {
    grid.innerHTML = `<div class="empty-state">Loading file browser...</div>`;
    return;
  }

  const items = buildFileBrowserItems(library, filters);
  grid.innerHTML = items.length
    ? items.map((item) => renderFileBrowserItem(item)).join("")
    : `<div class="empty-state">${escapeHtml(emptyFilesLabel())}</div>`;
}

function updateBrowserHistoryButtons(): void {
  const backButton = document.querySelector<HTMLButtonElement>("[data-cv-browser-history='back']");
  const forwardButton = document.querySelector<HTMLButtonElement>("[data-cv-browser-history='forward']");
  if (backButton) backButton.disabled = browserHistoryIndex <= 0;
  if (forwardButton) forwardButton.disabled = browserHistoryIndex >= browserHistory.length - 1;
}

function renderFileBrowserPath(): string {
  const activeFolder = filters.folderId ? library.folders.find((folderRecord) => folderRecord.id === filters.folderId) ?? null : null;
  const activeProjectId = filters.projectId ?? activeFolder?.projectId ?? null;
  const activeProject = activeProjectId ? library.projects.find((projectRecord) => projectRecord.id === activeProjectId) ?? null : null;
  const parts = [`<button type="button" data-cv-browser-root>Vault</button>`];

  if (activeProject) {
    parts.push(
      `<span aria-hidden="true">/</span><button type="button" data-cv-browser-project-id="${escapeAttr(activeProject.id)}">${escapeHtml(activeProject.name)}</button>`
    );
  }

  for (const folderRecord of activeFolder ? folderAncestry(activeFolder.id) : []) {
    parts.push(
      `<span aria-hidden="true">/</span><button type="button" data-cv-browser-project-id="${escapeAttr(folderRecord.projectId)}" data-cv-browser-folder-id="${escapeAttr(folderRecord.id)}">${escapeHtml(folderRecord.name)}</button>`
    );
  }

  return parts.join("");
}

function folderAncestry(folderId: string): FolderRecord[] {
  const ancestry: FolderRecord[] = [];
  let current = library.folders.find((folderRecord) => folderRecord.id === folderId) ?? null;
  while (current) {
    ancestry.unshift(current);
    current = current.parentId ? library.folders.find((folderRecord) => folderRecord.id === current?.parentId) ?? null : null;
  }
  return ancestry;
}

function fileBrowserSummary(): string {
  const items = buildFileBrowserItems(library, filters);
  const folders = items.filter((item) => item.kind === "project" || item.kind === "folder").length;
  const files = items.filter((item) => item.kind === "file").length;
  return `${folders} folders · ${files} files`;
}

function renderFileBrowserItem(item: FileBrowserItem): string {
  if (item.kind === "project") {
    return `
      <button class="file-os-item file-os-item--folder" type="button" data-cv-file-os-item data-cv-browser-project-id="${escapeAttr(item.id)}">
        <span class="file-os-item__icon file-os-item__icon--folder">${folderIcon()}</span>
        <span class="file-os-item__name">${escapeHtml(item.name)}</span>
        <span class="file-os-item__meta">${escapeHtml(fileCountLabel(item.fileCount))} · ${formatBytes(item.totalBytes)}</span>
      </button>
    `;
  }

  if (item.kind === "folder") {
    const deleteButton = canDeleteFolderNode() ? renderFolderDeleteButton(item.id, item.name, "file-os-item__delete") : "";
    return `
      <div class="file-os-item file-os-item--folder file-os-item--deletable" data-cv-file-os-item>
        <button class="file-os-item__main" type="button" data-cv-browser-project-id="${escapeAttr(item.projectId)}" data-cv-browser-folder-id="${escapeAttr(item.id)}">
          <span class="file-os-item__icon file-os-item__icon--folder">${folderIcon()}</span>
          <span class="file-os-item__name">${escapeHtml(item.name)}</span>
          <span class="file-os-item__meta">${escapeHtml(fileCountLabel(item.fileCount))} · ${formatBytes(item.totalBytes)}</span>
        </button>
        ${deleteButton}
      </div>
    `;
  }

  const ext = extensionForFile(item.file);
  const isSelected = selectedFileId === item.id;
  return `
    <button class="file-os-item file-os-item--file${isSelected ? " is-selected" : ""}" type="button" data-cv-file-os-item data-cv-browser-file-id="${escapeAttr(item.id)}" aria-selected="${isSelected ? "true" : "false"}">
      <span class="file-os-item__icon">
        <span class="file-type-icon" data-ext="${escapeAttr(ext)}">${escapeHtml(ext)}</span>
      </span>
      <span class="file-os-item__name">${escapeHtml(item.name)}</span>
      <span class="file-os-item__meta">${escapeHtml(typeLabel(item.file))} · ${formatBytes(item.file.sizeBytes)}</span>
    </button>
  `;
}

function getBrowserItemsForListView(): FileBrowserItem[] {
  return sortBrowserItemsForList(buildFileBrowserItems(library, filters), fileSort);
}

function getSelectableVisibleFileIds(): string[] {
  return getBrowserItemsForListView().filter((entry): entry is FileBrowserItem & { kind: "file" } => entry.kind === "file").map((entry) => entry.id);
}

function renderFileListRow(item: FileBrowserItem): string {
  if (item.kind === "project") {
    return renderFileListContainerRow("project", "Project", item.id, null, item.name, item.fileCount, item.totalBytes);
  }

  if (item.kind === "folder") {
    return renderFileListContainerRow("folder", "Folder", item.projectId, item.id, item.name, item.fileCount, item.totalBytes);
  }

  return renderFileListFileRow(item.file);
}

function sortBrowserItemsForList(items: FileBrowserItem[], sort: FileSort): FileBrowserItem[] {
  const rows = [...items];
  rows.sort((left, right) => {
    const leftGroup = listItemOrder(left);
    const rightGroup = listItemOrder(right);
    if (leftGroup !== rightGroup) return leftGroup - rightGroup;

    if (left.kind === "file" && right.kind === "file") {
      const leftValue = browserListSortValue(left.file, sort.key);
      const rightValue = browserListSortValue(right.file, sort.key);
      const compare =
        leftValue.kind === "string" && rightValue.kind === "string"
          ? leftValue.value.localeCompare(rightValue.value, undefined, { sensitivity: "base" })
          : (leftValue.kind === "number" && rightValue.kind === "number" ? leftValue.value - rightValue.value : 0);
      if (compare !== 0) return sort.direction === "asc" ? compare : -compare;
      return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
    }

    return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  });
  return rows;
}

function listItemOrder(item: FileBrowserItem): number {
  if (item.kind === "project") return 0;
  if (item.kind === "folder") return 1;
  return 2;
}

function browserListSortValue(fileRecord: FileRecord, key: FileSort["key"]): { kind: "number"; value: number } | { kind: "string"; value: string } {
  if (key === "size") return { kind: "number", value: fileRecord.sizeBytes };
  if (key === "modified") return { kind: "number", value: Number.isFinite(new Date(fileRecord.updatedAt).getTime()) ? new Date(fileRecord.updatedAt).getTime() : 0 };

  if (key === "type") return { kind: "string", value: typeLabel(fileRecord) };
  return { kind: "string", value: fileRecord.displayName };
}

function renderFileListContainerRow(
  itemKind: "project" | "folder",
  itemTypeLabel: string,
  projectId: string,
  folderId: string | null,
  name: string,
  fileCount: number,
  totalBytes: number
): string {
  const deleteButton = itemKind === "folder" && folderId && canDeleteFolderNode() ? renderFolderDeleteButton(folderId, name, "file-list-delete-button") : "";
  return `
    <tr class="file-table__row file-table__row--folder" data-cv-file-row data-cv-list-kind="${escapeAttr(itemKind)}" data-cv-browser-project-id="${escapeAttr(projectId)}" ${folderId ? `data-cv-browser-folder-id="${escapeAttr(folderId)}"` : ""} tabindex="0">
      <td class="select-cell">
        <span class="folder-row-placeholder" aria-hidden="true"></span>
      </td>
      <td>
        <span class="file-name">
          <span class="folder-row-icon" aria-hidden="true">${folderIcon()}</span>
          <span>${escapeHtml(name)}</span>
        </span>
      </td>
      <td><span class="file-list-meta">${escapeHtml(fileCountLabel(fileCount))}</span></td>
      <td>${escapeHtml(itemTypeLabel)}</td>
      <td>${formatBytes(totalBytes)}</td>
      <td class="date-cell">—</td>
      <td class="icon-cell"><span class="file-list-meta">—</span></td>
      <td class="icon-cell">${deleteButton}</td>
    </tr>
  `;
}

function renderFolderDeleteButton(folderId: string, folderName: string, className: string): string {
  const isDeleting = deletingFolderIds.has(folderId);
  const label = isDeleting ? `Deleting ${folderName}` : `Delete ${folderName}`;
  return `<button class="ghost-icon ${escapeAttr(className)}${isDeleting ? " is-deleting" : ""}" type="button" aria-label="${escapeAttr(label)}" title="${escapeAttr(label)}" data-cv-delete-folder-id="${escapeAttr(folderId)}" ${isDeleting ? 'disabled aria-busy="true"' : ""}>${isDeleting ? spinnerIcon() : trashIcon()}</button>`;
}

function renderFileListFileRow(fileRecord: FileRecord): string {
  return renderFileRow(fileRecord);
}

function fileCountLabel(count: number): string {
  return count === 1 ? "1 file" : `${count} files`;
}

function emptyFilesLabel(): string {
  return canReadCurrentAccess() ? "No files match the current filters." : "Current role has no file read access.";
}

function renderActiveFilters(): string {
  const chips: string[] = [];
  const tagRecord = filters.tagSlug ? library.tags.find((entry) => entry.slug === filters.tagSlug) : null;

  if (tagRecord) chips.push(filterChip(tagRecord.name));
  if (filters.quickFilter) chips.push(filterChip(quickFilterLabel(filters.quickFilter)));

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
    <tr class="${isSelected ? "is-selected" : ""}${isFailed ? " is-failed" : ""}" data-cv-file-row data-cv-list-kind="file" data-cv-file-id="${escapeAttr(fileRecord.id)}" tabindex="0" aria-selected="${isSelected ? "true" : "false"}">
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

function renderInspector(): void {
  const selectedFile = library.files.find((entry) => entry.id === selectedFileId) ?? null;
  const name = document.querySelector<HTMLElement>("[data-cv-selected-file-name]");
  const icon = document.querySelector<HTMLElement>("[data-cv-selected-file-icon]");
  const body = document.querySelector<HTMLElement>("[data-cv-inspector-body]");
  const downloadButton = document.querySelector<HTMLButtonElement>("[data-cv-download-button]");
  const shareFocusButton = document.querySelector<HTMLButtonElement>("[data-cv-share-focus-button]");
  const deleteButton = document.querySelector<HTMLButtonElement>("[data-cv-delete-button]");
  updateInspectorTabs();

  if (libraryLoading) {
    if (name) name.textContent = "Loading files";
    if (icon) {
      icon.textContent = "FILE";
      icon.dataset.ext = "FILE";
    }
    if (body) body.innerHTML = `<dl class="metadata-list"><div><dt>Status</dt><dd>Reading library metadata.</dd></div></dl>`;
    if (downloadButton) downloadButton.disabled = true;
    if (shareFocusButton) shareFocusButton.disabled = true;
    if (deleteButton) deleteButton.disabled = true;
    return;
  }

  if (!selectedFile) {
    if (name) name.textContent = "No file selected";
    if (icon) {
      icon.textContent = "FILE";
      icon.dataset.ext = "FILE";
    }
    const statusText = canReadCurrentAccess() ? "Select a file to inspect metadata." : "Current role is set to no-read.";
    if (body) body.innerHTML = `<dl class="metadata-list"><div><dt>Status</dt><dd>${escapeHtml(statusText)}</dd></div></dl>`;
    if (downloadButton) downloadButton.disabled = true;
    if (shareFocusButton) shareFocusButton.disabled = true;
    if (deleteButton) deleteButton.disabled = true;
    return;
  }

  const ext = extensionForFile(selectedFile);
  if (name) name.textContent = selectedFile.displayName;
  if (icon) {
    icon.textContent = ext;
    icon.dataset.ext = ext;
  }
  if (downloadButton) downloadButton.disabled = !canReadCurrentAccess();
  if (shareFocusButton) shareFocusButton.disabled = !canWriteCurrentAccess();
  if (deleteButton) deleteButton.disabled = !canWriteCurrentAccess();
  if (body) body.innerHTML = renderInspectorBody(selectedFile);
  if (inspectorTab === "activity" && !activityByFileId.has(selectedFile.id)) {
    void loadActivityForSelected();
  }
  if (inspectorTab === "details") {
    void loadSharesForSelected();
  }
}

function updateInspectorTabs(): void {
  const shell = document.querySelector<HTMLElement>("[data-cv-shell]");
  const inspector = document.querySelector<HTMLElement>("[data-cv-inspector]");
  shell?.setAttribute("data-cv-inspector-mode", inspectorTab);
  inspector?.setAttribute("data-cv-inspector-mode", inspectorTab);
  inspector?.setAttribute("data-cv-inspector-tab-motion", inspectorTabMotion);
  updateSidePanels();
  document.querySelectorAll<HTMLElement>("[data-cv-inspector-tab]").forEach((button) => {
    const isActive = button.dataset.cvInspectorTab === inspectorTab;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  });
}

function revealInspectorForSelection(): void {
  if (!selectedFileId) return;
  inspectorCollapsed = nextInspectorPanelCollapsed(inspectorCollapsed, "select-file");
}

function closeInspector(): void {
  inspectorCollapsed = nextInspectorPanelCollapsed(inspectorCollapsed, "close");
  writeStoredBoolean(inspectorCollapsedStorageKey, inspectorCollapsed);
  updateInspectorTabs();
}

function renderInspectorBody(fileRecord: FileRecord): string {
  let content = `${renderDetailsPanel(fileRecord)}${renderSharePanel(fileRecord)}`;
  if (inspectorTab === "preview") content = renderPreviewPanel(fileRecord);
  if (inspectorTab === "activity") content = renderActivityPanel(fileRecord);
  return `<div data-cv-inspector-content data-cv-inspector-motion="${inspectorTabMotion}" data-cv-inspector-motion-key="${inspectorTabMotionSequence}">${content}</div>`;
}

function renderDetailsPanel(fileRecord: FileRecord): string {
  return `<dl class="metadata-list" data-cv-metadata-list>${renderMetadata(fileRecord)}</dl>`;
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
    ["Visibility", fileVisibilityLabel(fileRecord)],
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

function renderPreviewPanel(fileRecord: FileRecord): string {
  const kind = previewKindForFile(fileRecord);
  if (fileRecord.status !== "ready") {
    if (!previewMode && (fileRecord.status === "pending" || fileRecord.status === "uploading") && kind !== "unsupported") {
      return renderRecoveringPreview(fileRecord, kind);
    }
    return `<div class="preview-empty">${warningIcon()}<strong>Preview unavailable</strong><span>${escapeHtml(fileRecord.status)} file</span></div>`;
  }

  if (kind === "unsupported") {
    return `
      <div class="preview-empty">
        ${fileIcon()}
        <strong>No inline preview</strong>
        <span>${escapeHtml(typeLabel(fileRecord))} · ${escapeHtml(formatBytes(fileRecord.sizeBytes))}</span>
      </div>
    `;
  }

  if (previewMode) return renderSeedPreview(fileRecord, kind);

  const previewUrl = `/api/files/${encodeURIComponent(fileRecord.id)}/preview`;
  if (kind === "image") {
    return `
      <figure class="preview-pane">
        <img class="preview-image" src="${escapeAttr(previewUrl)}" alt="${escapeAttr(fileRecord.displayName)}" />
        <figcaption>${escapeHtml(typeLabel(fileRecord))} · ${escapeHtml(formatBytes(fileRecord.sizeBytes))}</figcaption>
      </figure>
    `;
  }

  return `
    <section class="preview-pane">
      <iframe class="preview-frame${kind === "csv" || kind === "text" ? " preview-frame--text" : ""}" src="${escapeAttr(previewUrl)}" title="${escapeAttr(fileRecord.displayName)} preview"></iframe>
    </section>
  `;
}

function renderRecoveringPreview(fileRecord: FileRecord, kind: ReturnType<typeof previewKindForFile>): string {
  const previewUrl = `/api/files/${encodeURIComponent(fileRecord.id)}/preview`;
  const caption = `${typeLabel(fileRecord)} · ${formatBytes(fileRecord.sizeBytes)} · checking stored object`;
  if (kind === "image") {
    return `
      <figure class="preview-pane preview-pane--recovering">
        <img class="preview-image" src="${escapeAttr(previewUrl)}" alt="${escapeAttr(fileRecord.displayName)}" />
        <figcaption>${escapeHtml(caption)}</figcaption>
      </figure>
    `;
  }

  return `
    <section class="preview-pane preview-pane--recovering">
      <iframe class="preview-frame${kind === "csv" || kind === "text" ? " preview-frame--text" : ""}" src="${escapeAttr(previewUrl)}" title="${escapeAttr(fileRecord.displayName)} preview"></iframe>
    </section>
  `;
}

function renderSeedPreview(fileRecord: FileRecord, kind: ReturnType<typeof previewKindForFile>): string {
  if (kind === "csv") {
    return `
      <section class="preview-pane">
        <table class="preview-table">
          <thead><tr><th>time_min</th><th>conversion</th><th>temperature_c</th></tr></thead>
          <tbody>
            <tr><td>0</td><td>0.00</td><td>25.0</td></tr>
            <tr><td>15</td><td>0.34</td><td>25.1</td></tr>
            <tr><td>30</td><td>0.61</td><td>25.0</td></tr>
            <tr><td>60</td><td>0.88</td><td>25.2</td></tr>
          </tbody>
        </table>
      </section>
    `;
  }

  if (kind === "text") {
    return `
      <section class="preview-pane">
        <pre class="preview-text">##TITLE=Compound 14 1H NMR
##JCAMP-DX=5.00
##DATA TYPE=NMR SPECTRUM
##.OBSERVE FREQUENCY=400.13
##$SOLVENT=CDCl3
##PEAK TABLE=(XY..XY)
7.26, 1.00
6.91, 2.04
3.82, 3.01</pre>
      </section>
    `;
  }

  return `
    <div class="preview-empty preview-empty--ready">
      ${fileIcon()}
      <strong>${escapeHtml(fileRecord.displayName)}</strong>
      <span>${escapeHtml(typeLabel(fileRecord))} · ${escapeHtml(formatBytes(fileRecord.sizeBytes))}</span>
    </div>
  `;
}

function renderSharePanel(fileRecord: FileRecord): string {
  const state = getShareState(fileRecord.id);
  const shares = state.shares ?? [];
  const canWrite = canWriteCurrentAccess();
  const customExpiryValue = defaultShareCustomExpiryValue();
  const customExpiryMin = minShareCustomExpiryValue();
  const customExpiryMax = maxShareCustomExpiryValue();
  return `
    <section class="share-panel" aria-label="File sharing">
      <header>
        <h3>Share</h3>
        <span>${canWrite ? (shares.length ? `${shares.length} managed` : "Read-only link") : "Read-only role"}</span>
      </header>
      <form class="share-form" data-cv-share-form>
        <label class="share-expiry-control">
          <span>Expires</span>
          <div class="share-expiry-stack">
            <select name="expiresInDays" data-cv-share-expiry>
              <option value="1">1 day</option>
              <option value="7" selected>7 days</option>
              <option value="30">30 days</option>
              <option value="custom">Custom date/time</option>
            </select>
            <input type="datetime-local" name="expiresAtLocal" value="${escapeAttr(customExpiryValue)}" min="${escapeAttr(customExpiryMin)}" max="${escapeAttr(customExpiryMax)}" data-cv-share-custom-expiry hidden disabled />
          </div>
        </label>
        <label class="share-toggle">
          <input type="checkbox" name="allowDownload" ${canWrite ? "" : "disabled"} />
          <span>Allow download</span>
        </label>
        <label class="share-toggle">
          <input type="checkbox" name="isPublic" ${canWrite ? "" : "disabled"} />
          <span>Public link (no Cloudflare verification required)</span>
        </label>
        <button class="button button--primary" type="submit" ${state.loading || !canWrite ? "disabled" : ""}>${state.loading ? "Creating" : "Create link"}</button>
      </form>
      ${canWrite ? "" : `<p class="form-status">Current role can read files but cannot create or edit share links.</p>`}
      ${
        state.link
          ? `<div class="share-link-row"><input type="text" value="${escapeAttr(state.link)}" readonly data-cv-share-link /><button class="button button--secondary" type="button" data-cv-copy-share>Copy</button></div>`
          : ""
      }
      ${state.error ? `<p class="form-status form-status--error">${escapeHtml(state.error)}</p>` : ""}
      ${state.message ? `<p class="form-status">${escapeHtml(state.message)}</p>` : ""}
      ${renderManagedShares(fileRecord.id, state)}
    </section>
  `;
}

function renderManagedShares(fileId: string, state: ShareUiState): string {
  if (state.listLoading) return `<div class="share-list-status">Loading share links...</div>`;
  if (state.listError) return `<div class="share-list-status share-list-status--error">${escapeHtml(state.listError)}</div>`;
  const shares = state.shares ?? [];
  if (shares.length === 0) return `<div class="share-list-status">No active share links.</div>`;

  return `
    <div class="share-list" aria-label="Managed share links">
      ${shares.map((share) => renderManagedShareRow(fileId, share)).join("")}
    </div>
  `;
}

function renderManagedShareRow(fileId: string, share: FileShareRecord): string {
  const shareUrl = formatShareUrl(window.location.href, share.token, share.isPublic);
  const expired = new Date(share.expiresAt).getTime() <= Date.now();
  const canWrite = canWriteCurrentAccess();
  const accessLabel = share.isPublic ? "Public link" : "Authenticated only";
  const customExpiryMin = minShareCustomExpiryValue();
  const customExpiryMax = maxShareCustomExpiryValue();
  const customExpiryValue = datetimeLocalValue(new Date(share.expiresAt));
  return `
    <form class="share-list__item" data-cv-share-update-form data-cv-file-id="${escapeAttr(fileId)}" data-cv-share-token="${escapeAttr(share.token)}">
      <div class="share-list__summary">
        <strong>${escapeHtml(share.token.slice(0, 12))}</strong>
        <span>${expired ? "Expired" : `Expires ${escapeHtml(formatDate(share.expiresAt))}`} · ${share.accessCount} opens · ${accessLabel}</span>
        <input type="text" value="${escapeAttr(shareUrl)}" readonly />
      </div>
      <div class="share-list__actions">
        <select name="expiresInDays" aria-label="New expiration for ${escapeAttr(share.token)}" data-cv-share-expiry ${canWrite ? "" : "disabled"}>
          <option value="1">1 day</option>
          <option value="7" selected>7 days</option>
          <option value="30">30 days</option>
          <option value="custom">Custom</option>
        </select>
        <input class="share-list__custom-expiry" type="datetime-local" name="expiresAtLocal" value="${escapeAttr(customExpiryValue)}" min="${escapeAttr(customExpiryMin)}" max="${escapeAttr(customExpiryMax)}" data-cv-share-custom-expiry hidden disabled />
        <button class="button button--secondary" type="submit" ${canWrite ? "" : "disabled"}>Update</button>
        <button class="button button--secondary" type="button" data-cv-copy-managed-share data-cv-share-token="${escapeAttr(share.token)}">Copy</button>
        <button class="button button--danger" type="button" data-cv-delete-share data-cv-share-token="${escapeAttr(share.token)}" ${canWrite ? "" : "disabled"}>Delete</button>
      </div>
    </form>
  `;
}

function renderActivityPanel(fileRecord: FileRecord): string {
  const state = activityByFileId.get(fileRecord.id);
  if (!state || state.loading) {
    return `<div class="activity-empty">Loading activity...</div>`;
  }
  if (state.error) {
    return `<div class="activity-empty activity-empty--error">${escapeHtml(state.error)}</div>`;
  }
  const items = state.data ?? [];
  if (items.length === 0) {
    return `<div class="activity-empty">No activity recorded.</div>`;
  }
  return `<ol class="activity-list">${items.map(renderActivityItem).join("")}</ol>`;
}

function renderActivityItem(activity: FileActivityRecord): string {
  const actor = activity.actorEmail || "Shared link";
  const metadata = activity.metadata;
  const token = typeof metadata?.token === "string" ? ` · ${metadata.token.slice(0, 10)}` : "";
  return `
    <li class="activity-item">
      <span class="activity-dot"></span>
      <div>
        <strong>${escapeHtml(activityEventLabel(activity.eventType))}${escapeHtml(token)}</strong>
        <span>${escapeHtml(actor)} · ${escapeHtml(formatDate(activity.createdAt))}</span>
      </div>
    </li>
  `;
}

function activityEventLabel(eventType: FileActivityRecord["eventType"]): string {
  switch (eventType) {
    case "preview":
      return "Previewed";
    case "download":
      return "Downloaded";
    case "share_created":
      return "Share link created";
    case "share_accessed":
      return "Share link opened";
    case "share_download":
      return "Share download";
  }
}

async function handleDroppedUploads(dataTransfer: DataTransfer | null): Promise<void> {
  const selections = await uploadSelectionsFromDataTransfer(dataTransfer);
  await handleFiles(selections.length ? selections : dataTransfer?.files ?? null);
}

async function uploadSelectionsFromDataTransfer(dataTransfer: DataTransfer | null): Promise<BrowserUploadSelection[]> {
  if (!dataTransfer?.items?.length) return [];
  const selections = await Promise.all(
    Array.from(dataTransfer.items).map((item) => {
      const entry = typeof item.webkitGetAsEntry === "function" ? (item.webkitGetAsEntry() as unknown as BrowserFileEntry | null) : null;
      return entry ? uploadSelectionsFromEntry(entry, "") : Promise.resolve([]);
    })
  );
  return selections.flat();
}

async function uploadSelectionsFromEntry(entry: BrowserFileEntry, prefix: string): Promise<BrowserUploadSelection[]> {
  if (entry.isFile) {
    const file = await readFileEntry(entry as BrowserFileSystemFileEntry);
    return [{ file, relativePath: `${prefix}${file.name}` }];
  }

  if (!entry.isDirectory) return [];
  const directory = entry as BrowserFileSystemDirectoryEntry;
  const entries = await readAllDirectoryEntries(directory);
  const childSelections = await Promise.all(entries.map((child) => uploadSelectionsFromEntry(child, `${prefix}${directory.name}/`)));
  return childSelections.flat();
}

function readFileEntry(entry: BrowserFileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function readAllDirectoryEntries(directory: BrowserFileSystemDirectoryEntry): Promise<BrowserFileEntry[]> {
  const reader = directory.createReader();
  const entries: BrowserFileEntry[] = [];

  while (true) {
    const batch = await new Promise<BrowserFileEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) return entries;
    entries.push(...batch);
  }
}

async function handleFiles(fileList: FileList | BrowserUploadSelection[] | null): Promise<void> {
  if (!canWriteCurrentAccess()) {
    openUploadModal({ reset: false });
    const queueId = `local_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    uploadQueue = reduceUploadQueue(uploadQueue, { type: "add", id: queueId, name: "Upload request", sizeBytes: 0 });
    uploadQueue = reduceUploadQueue(uploadQueue, { type: "fail", id: queueId, message: "Current role does not allow uploads" });
    renderQueue();
    return;
  }
  const files = normalizeUploadSelections(fileList);
  if (files.length === 0) return;
  openUploadModal({ reset: false });
  const activeProjectId = filters.projectId || library.projects[0]?.id;
  if (!activeProjectId) {
    const queueId = `local_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    uploadQueue = reduceUploadQueue(uploadQueue, { type: "add", id: queueId, name: "Upload request", sizeBytes: 0 });
    uploadQueue = reduceUploadQueue(uploadQueue, { type: "fail", id: queueId, message: "Project is required before upload" });
    renderQueue();
    return;
  }

  const targets = files.map(prepareUploadTarget);
  uploadQueue = reduceUploadQueue(uploadQueue, {
    type: "stage",
    items: targets.map((target) => ({ id: target.queueId, name: target.queueName, sizeBytes: target.file.size })),
  });
  renderQueue();

  for (const target of targets) {
    try {
      const folderId = await ensureUploadFolderPath(activeProjectId, target.pathInfo.folderParts);
      await uploadBrowserFile(target.file, {
        queueId: target.queueId,
        displayName: target.displayName,
        queueName: target.queueName,
        folderId,
        pathInfo: target.pathInfo,
      });
    } catch (error) {
      uploadQueue = reduceUploadQueue(uploadQueue, { type: "fail", id: target.queueId, message: errorMessage(error) });
      renderQueue();
    }
  }
}

function prepareUploadTarget(selection: BrowserUploadSelection): PreparedUploadTarget {
  const browserFile = selection.file;
  const pathInfo = splitUploadPath({ name: browserFile.name, webkitRelativePath: browserFile.webkitRelativePath, relativePath: selection.relativePath });
  return {
    queueId: `local_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    file: browserFile,
    displayName: pathInfo.name,
    queueName: pathInfo.relativePath,
    pathInfo,
  };
}

function normalizeUploadSelections(fileList: FileList | BrowserUploadSelection[] | null): BrowserUploadSelection[] {
  if (!fileList) return [];
  if (Array.isArray(fileList)) return fileList;
  return Array.from(fileList).map((file) => ({ file }));
}

async function uploadBrowserFile(
  browserFile: File,
  target: { queueId: string; displayName: string; queueName: string; folderId: string | null; pathInfo: UploadPathInfo }
): Promise<void> {
  uploadQueue = reduceUploadQueue(uploadQueue, { type: "start", id: target.queueId });
  renderQueue();

  try {
    assertUploadFileAllowed({ name: target.displayName, size: browserFile.size, mimeType: browserFile.type || null });
    const activeProjectId = filters.projectId || library.projects[0]?.id;
    if (!activeProjectId) throw new Error("Project is required before upload");

    if (previewMode) {
      uploadQueue = reduceUploadQueue(uploadQueue, { type: "progress", id: target.queueId, loadedBytes: browserFile.size });
      uploadQueue = reduceUploadQueue(uploadQueue, { type: "complete", id: target.queueId });
      const now = new Date().toISOString();
      const localFile: FileRecord = {
        id: `local_file_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        projectId: activeProjectId,
        folderId: target.folderId,
        displayName: target.displayName,
        originalName: target.pathInfo.relativePath,
        r2Key: `preview/${target.pathInfo.relativePath}`,
        mimeType: browserFile.type || null,
        sizeBytes: browserFile.size,
        status: "ready",
        checksum: null,
        uploadSessionId: null,
        actorEmail: currentActorEmail,
        downloadCount: 0,
        ...uploadAccessPayload(),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        tags: [],
      };
      library = { ...library, files: [localFile, ...library.files] };
      selectedFileId = localFile.id;
      selectedFileIds = new Set([localFile.id]);
      revealInspectorForSelection();
      renderAll();
      return;
    }

    const init = await fetchJson<InitUploadResponse>("/api/files/init", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: target.displayName,
        size: browserFile.size,
        mimeType: browserFile.type || null,
        projectId: activeProjectId,
        folderId: target.folderId,
        tags: filters.tagSlug ? [library.tags.find((entry) => entry.slug === filters.tagSlug)?.name].filter(Boolean) : [],
        ...uploadAccessPayload(),
      }),
    });

    await uploadFileBytes(init.upload.url, browserFile, (loadedBytes) => {
      uploadQueue = reduceUploadQueue(uploadQueue, { type: "progress", id: target.queueId, loadedBytes });
      renderQueue();
    });

    const completed = await fetchJson<{ status: string; fileId: string }>("/api/files/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileId: init.file.id, sessionId: init.session.id }),
    });

    const completedAt = new Date().toISOString();
    const completedFile: FileRecord = {
      ...init.file,
      id: completed.fileId || init.file.id,
      status: completed.status === "ready" ? "ready" : init.file.status,
      updatedAt: completedAt,
    };
    if (completedFile.status === "ready") {
      completedUploadFiles.set(completedFile.id, completedFile);
      library = mergeCompletedUploadFiles(library, completedUploadFiles.values());
    }
    uploadQueue = reduceUploadQueue(uploadQueue, { type: "complete", id: target.queueId });
    selectedFileId = completedFile.id;
    revealInspectorForSelection();
    await reloadLibrary();
  } catch (error) {
    uploadQueue = reduceUploadQueue(uploadQueue, { type: "fail", id: target.queueId, message: errorMessage(error) });
    renderQueue();
  }
}

async function ensureUploadFolderPath(projectId: string, folderParts: string[]): Promise<string | null> {
  const activeFolder = filters.folderId ? library.folders.find((entry) => entry.id === filters.folderId) ?? null : null;
  let parentId = filters.folderId;
  for (const folderName of resolveUploadFolderParts(activeFolder, folderParts)) {
    parentId = await ensureUploadFolder(projectId, parentId, folderName);
  }
  return parentId;
}

async function ensureUploadFolder(projectId: string, parentId: string | null, name: string): Promise<string> {
  const existing = findFolder(projectId, parentId, name);
  if (existing) return existing.id;

  if (previewMode) {
    const folderRecord = createLocalFolder(projectId, parentId, name);
    library = { ...library, folders: [...library.folders, folderRecord] };
    renderSidebar();
    return folderRecord.id;
  }

  const response = await fetchJson<{ folder: FolderRecord }>("/api/folders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId, parentId, name }),
  });
  library = { ...library, folders: [...library.folders, response.folder] };
  renderSidebar();
  return response.folder.id;
}

function findFolder(projectId: string, parentId: string | null, name: string): FolderRecord | null {
  const normalizedName = name.trim().toLowerCase();
  return (
    library.folders.find(
      (folderRecord) =>
        folderRecord.projectId === projectId &&
        (folderRecord.parentId ?? null) === (parentId ?? null) &&
        folderRecord.name.trim().toLowerCase() === normalizedName
    ) ?? null
  );
}

function createLocalFolder(projectId: string, parentId: string | null, name: string): FolderRecord {
  const now = new Date().toISOString();
  const parent = parentId ? library.folders.find((entry) => entry.id === parentId) : null;
  const path = `${parent?.path || ""}/${name}`.replace(/\/+/g, "/");
  return {
    id: `local_folder_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    projectId,
    parentId,
    name,
    slug: slugify(name),
    path,
    createdAt: now,
    updatedAt: now,
  };
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
    library = mergeCompletedUploadFiles(displayState.library, completedUploadFiles.values());
    for (const fileRecord of displayState.library.files) {
      if (fileRecord.status === "ready") completedUploadFiles.delete(fileRecord.id);
    }
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
  await deleteFileIds([selectedFileId], "Delete request");
}

async function deleteSelectedFiles(): Promise<void> {
  const fileIds = Array.from(selectedFileIds).filter((fileId) => library.files.some((entry) => entry.id === fileId && entry.status !== "deleted"));
  await deleteFileIds(fileIds, "Delete selected files");
}

async function deleteFileIds(fileIds: string[], queueName: string): Promise<void> {
  if (fileIds.length === 0 || !canWriteCurrentAccess()) return;

  if (previewMode) {
    const now = new Date().toISOString();
    library = { ...library, files: markFilesDeleted(library.files, new Set(fileIds), now) };
    selectedFileId = null;
    selectedFileIds = new Set();
    renderAll();
    return;
  }

  const failures: string[] = [];
  for (const fileId of fileIds) {
    try {
      await fetchJson<{ status: string; fileId: string }>(`/api/files/${encodeURIComponent(fileId)}`, { method: "DELETE" });
    } catch (error) {
      failures.push(errorMessage(error));
    }
  }

  selectedFileId = null;
  selectedFileIds = new Set();
  if (failures.length > 0) {
    uploadQueue = reduceUploadQueue(uploadQueue, {
      type: "add",
      id: `delete_${Date.now()}`,
      name: queueName,
      sizeBytes: 0,
    });
    const latest = uploadQueue[0];
    if (latest) {
      uploadQueue = reduceUploadQueue(uploadQueue, {
        type: "fail",
        id: latest.id,
        message: failures.length === 1 ? failures[0] : `${failures.length} delete requests failed`,
      });
    }
  }

  try {
    await reloadLibrary();
    selectedFileId = null;
    selectedFileIds = new Set();
    renderFiles();
    renderInspector();
  } catch (error) {
    uploadQueue = reduceUploadQueue(uploadQueue, {
      type: "add",
      id: `delete_${Date.now()}`,
      name: queueName,
      sizeBytes: 0,
    });
    const latest = uploadQueue[0];
    if (latest) {
      uploadQueue = reduceUploadQueue(uploadQueue, { type: "fail", id: latest.id, message: errorMessage(error) });
    }
    renderQueue();
  }
}

async function deleteFolder(folderId: string): Promise<void> {
  if (!folderId || deletingFolderIds.has(folderId)) return;
  if (!canWriteCurrentAccess()) {
    fileBrowserNotice = { message: "Current role cannot delete folders.", tone: "error" };
    renderFileBrowser();
    return;
  }
  const folderRecord = library.folders.find((entry) => entry.id === folderId);
  if (!folderRecord) return;
  const scope = getFolderDeletionScope(library.folders, library.files, folderId);
  const hasContents = scope.folderIds.length > 1 || scope.fileIds.length > 0;
  if (hasContents && !window.confirm(folderDeleteConfirmationMessage(folderRecord.name, scope.folderIds.length, scope.fileIds.length))) return;
  const folderIdSet = new Set(scope.folderIds);
  const fileIdSet = new Set(scope.fileIds);
  setFolderDeleting(folderId, true);
  fileBrowserNotice = { message: `Deleting "${folderRecord.name}"...`, tone: "info" };
  renderFiles();

  try {
    if (previewMode) {
      const now = new Date().toISOString();
      library = {
        ...library,
        folders: library.folders.filter((entry) => !folderIdSet.has(entry.id)),
        files: markFilesDeleted(library.files, fileIdSet, now),
      };
      if (filters.folderId && folderIdSet.has(filters.folderId)) {
        filters = { ...filters, folderId: null, projectId: folderRecord.projectId };
        recordBrowserHistory({ projectId: folderRecord.projectId, folderId: null }, "replace");
      }
      if (selectedFileId && fileIdSet.has(selectedFileId)) {
        selectedFileId = null;
        selectedFileIds = new Set();
      }
      fileBrowserNotice = { message: `Deleted "${folderRecord.name}".`, tone: "info" };
      renderAll();
      return;
    }

    await fetchJson<{ status: string; folderId: string }>(`/api/folders/${encodeURIComponent(folderId)}`, {
      method: "DELETE",
      headers: hasContents ? { "content-type": "application/json" } : undefined,
      body: hasContents ? JSON.stringify({ recursive: true }) : undefined,
    });
    if (filters.folderId && folderIdSet.has(filters.folderId)) {
      filters = { ...filters, folderId: null, projectId: folderRecord.projectId };
      recordBrowserHistory({ projectId: folderRecord.projectId, folderId: null }, "replace");
    }
    fileBrowserNotice = { message: `Deleted "${folderRecord.name}".`, tone: "info" };
    await reloadLibrary();
  } catch (error) {
    fileBrowserNotice = { message: `Delete failed: ${errorMessage(error)}`, tone: "error" };
    uploadQueue = reduceUploadQueue(uploadQueue, {
      type: "add",
      id: `delete_folder_${Date.now()}`,
      name: folderRecord.name,
      sizeBytes: 0,
    });
    const latest = uploadQueue[0];
    if (latest) {
      uploadQueue = reduceUploadQueue(uploadQueue, { type: "fail", id: latest.id, message: errorMessage(error) });
    }
    renderQueue();
    renderFiles();
    renderSidebar();
  } finally {
    setFolderDeleting(folderId, false);
    renderFiles();
    renderSidebar();
  }
}

function setFolderDeleting(folderId: string, isDeleting: boolean): void {
  const next = new Set(deletingFolderIds);
  if (isDeleting) next.add(folderId);
  else next.delete(folderId);
  deletingFolderIds = next;
}

function folderDeleteConfirmationMessage(folderName: string, folderCount: number, fileCount: number): string {
  const nestedFolderCount = Math.max(0, folderCount - 1);
  const folderLabel = nestedFolderCount === 1 ? "1 nested folder" : `${nestedFolderCount} nested folders`;
  const fileLabel = fileCount === 1 ? "1 file" : `${fileCount} files`;
  return `Delete "${folderName}" and all contained content? This will remove ${folderLabel} and ${fileLabel}.`;
}

async function loadActivityForSelected(): Promise<void> {
  const fileId = selectedFileId;
  if (!fileId) return;
  if (previewMode) {
    const selectedFile = library.files.find((entry) => entry.id === fileId);
    activityByFileId.set(fileId, {
      loading: false,
      error: null,
      data: [
        {
          id: `seed_activity_${fileId}_1`,
          fileId,
          actorEmail: selectedFile?.actorEmail ?? currentActorEmail,
          eventType: "preview",
          metadata: { mode: "seed" },
          createdAt: new Date("2026-06-17T08:00:00.000Z").toISOString(),
        },
        {
          id: `seed_activity_${fileId}_2`,
          fileId,
          actorEmail: currentActorEmail,
          eventType: "share_created",
          metadata: { mode: "seed" },
          createdAt: new Date("2026-06-16T13:30:00.000Z").toISOString(),
        },
      ],
    });
    renderInspector();
    return;
  }

  const existing = activityByFileId.get(fileId);
  if (existing?.loading || existing?.data) return;

  activityByFileId.set(fileId, { loading: true, data: null, error: null });
  renderInspector();
  try {
    const response = await fetchJson<ActivityResponse>(`/api/files/${encodeURIComponent(fileId)}/activity`);
    activityByFileId.set(fileId, { loading: false, data: response.activity, error: null });
  } catch (error) {
    activityByFileId.set(fileId, { loading: false, data: null, error: errorMessage(error) });
  }
  if (selectedFileId === fileId && inspectorTab === "activity") renderInspector();
}

async function loadRoleSettings(): Promise<void> {
  if (roleSettingsState.loading) return;
  roleSettingsState = { ...roleSettingsState, loading: true, error: null };
  renderRoleSettings();
  try {
    const response = await fetchJson<RolesResponse>("/api/roles");
    rolePolicies = response.roles;
    currentActorAccess = normalizeActorAccess(response.actorAccess, currentActorEmail);
    roleSettingsState = { loading: false, saving: false, error: null, message: null };
  } catch (error) {
    const message = errorMessage(error);
    roleSettingsState = { loading: false, saving: false, error: previewMode && message === "404 Not Found" ? null : message, message: null };
  }
  renderAccountIdentity();
  renderInspector();
}

async function saveRoleSettings(form: HTMLFormElement): Promise<void> {
  if (!currentActorAccess.canManageRoles) return;
  const updates = Array.from(form.querySelectorAll("[data-cv-role-permission]")).map((element) => {
    const select = element as unknown as HTMLSelectElement;
    return {
      id: select.dataset.cvRoleId || "",
      permission: select.value as FilePermissionLevel,
    };
  });
  roleSettingsState = { ...roleSettingsState, saving: true, error: null, message: null };
  renderRoleSettings();
  try {
    const response = await fetchJson<RolesResponse>("/api/roles", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roles: updates }),
    });
    rolePolicies = response.roles;
    currentActorAccess = normalizeActorAccess(response.actorAccess, currentActorEmail);
    roleSettingsState = { loading: false, saving: false, error: null, message: "Role permissions saved." };
  } catch (error) {
    roleSettingsState = { loading: false, saving: false, error: errorMessage(error), message: null };
  }
  renderAccountIdentity();
  renderInspector();
}

interface ShareExpiryPayload {
  expiresInDays?: number;
  expiresAt?: string;
}

function syncShareCustomExpiry(select: HTMLSelectElement): void {
  const form = select.closest<HTMLFormElement>("form");
  const input = form?.querySelector<HTMLInputElement>("[data-cv-share-custom-expiry]");
  if (!input) return;
  const custom = select.value === "custom";
  input.hidden = !custom;
  input.disabled = !custom;
  if (custom && !input.value) input.value = defaultShareCustomExpiryValue();
  if (custom) input.focus();
}

function shareExpiryPayloadFromForm(form: HTMLFormElement): ShareExpiryPayload {
  const formData = new FormData(form);
  const mode = String(formData.get("expiresInDays") || "7");
  if (mode === "custom") {
    const rawValue = String(formData.get("expiresAtLocal") || "");
    const expiresAt = new Date(rawValue);
    if (!rawValue || !Number.isFinite(expiresAt.getTime())) throw new Error("Choose a valid custom expiration time.");
    if (expiresAt.getTime() <= Date.now()) throw new Error("Choose a future expiration time.");
    if (expiresAt.getTime() > Date.now() + 365 * 24 * 60 * 60 * 1000) throw new Error("Choose an expiration within 365 days.");
    return { expiresAt: expiresAt.toISOString() };
  }

  const expiresInDays = Number(mode);
  return { expiresInDays: [1, 7, 30].includes(expiresInDays) ? expiresInDays : 7 };
}

function expiresAtFromShareExpiryPayload(payload: ShareExpiryPayload): string {
  if (payload.expiresAt) return payload.expiresAt;
  const expiresInDays = payload.expiresInDays ?? 7;
  return new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
}

function defaultShareCustomExpiryValue(): string {
  return datetimeLocalValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
}

function minShareCustomExpiryValue(): string {
  return datetimeLocalValue(new Date(Date.now() + 60 * 1000));
}

function maxShareCustomExpiryValue(): string {
  return datetimeLocalValue(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));
}

function datetimeLocalValue(date: Date): string {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return localDate.toISOString().slice(0, 16);
}

async function createShareForSelected(form: HTMLFormElement): Promise<void> {
  const fileId = selectedFileId;
  if (!fileId) return;
  if (!canWriteCurrentAccess()) return;
  const formData = new FormData(form);
  const allowDownload = formData.get("allowDownload") === "on";
  const isPublic = formData.get("isPublic") === "on";
  const previous = getShareState(fileId);
  let expiryPayload: ShareExpiryPayload;
  try {
    expiryPayload = shareExpiryPayloadFromForm(form);
  } catch (error) {
    shareByFileId.set(fileId, { ...previous, loading: false, message: null, error: errorMessage(error) });
    renderInspector();
    return;
  }
  shareByFileId.set(fileId, { ...previous, loading: true, message: null, error: null });
  renderInspector();

  if (previewMode) {
    const link = formatShareUrl(window.location.href, `preview_${fileId}`, isPublic);
    shareByFileId.set(fileId, {
      ...previous,
      loading: false,
      link,
      message: allowDownload ? "Preview share link includes download permission." : "Preview share link is read-only.",
      error: null,
      shares: [
        {
          token: `preview_${fileId}`,
          fileId,
          createdByEmail: currentActorEmail,
          allowDownload,
          isPublic,
          expiresAt: expiresAtFromShareExpiryPayload(expiryPayload),
          createdAt: new Date().toISOString(),
          revokedAt: null,
          accessCount: 0,
          lastAccessedAt: null,
        },
      ],
    });
    activityByFileId.delete(fileId);
    renderInspector();
    showToast("链接已创建");
    return;
  }

  try {
    const response = await fetchJson<ShareCreateResponse>(`/api/files/${encodeURIComponent(fileId)}/share`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...expiryPayload, allowDownload, isPublic }),
    });
    shareByFileId.set(fileId, {
      ...previous,
      loading: false,
      link: response.shareUrl,
      message: response.share.allowDownload ? "Link ready with download access." : "Read-only link ready.",
      error: null,
      shares: [response.share, ...(previous.shares ?? [])],
      listLoading: false,
      listError: null,
    });
    activityByFileId.delete(fileId);
    showToast("链接已创建");
  } catch (error) {
    shareByFileId.set(fileId, { ...previous, loading: false, link: null, message: null, error: errorMessage(error) });
    showToast("创建失败", "error");
  }
  renderInspector();
  if (inspectorTab === "activity") void loadActivityForSelected();
}

async function loadSharesForSelected(force = false): Promise<void> {
  const fileId = selectedFileId;
  if (!fileId || previewMode) return;
  const state = getShareState(fileId);
  if (!force && (state.listLoading || state.shares)) return;

  shareByFileId.set(fileId, { ...state, listLoading: true, listError: null });
  renderInspector();
  try {
    const response = await fetchJson<FileShareListResponse>(`/api/files/${encodeURIComponent(fileId)}/share`);
    shareByFileId.set(fileId, { ...getShareState(fileId), shares: response.shares, listLoading: false, listError: null });
  } catch (error) {
    shareByFileId.set(fileId, { ...getShareState(fileId), listLoading: false, listError: errorMessage(error) });
  }
  if (selectedFileId === fileId && inspectorTab === "details") renderInspector();
}

async function updateManagedShare(form: HTMLFormElement): Promise<void> {
  const fileId = selectedFileId;
  const token = form.dataset.cvShareToken;
  if (!fileId || !token) return;
  if (!canWriteCurrentAccess()) return;
  const state = getShareState(fileId);
  let expiryPayload: ShareExpiryPayload;
  try {
    expiryPayload = shareExpiryPayloadFromForm(form);
  } catch (error) {
    shareByFileId.set(fileId, { ...state, message: null, error: errorMessage(error) });
    renderInspector();
    return;
  }
  shareByFileId.set(fileId, { ...state, message: "Updating share link...", error: null });
  renderInspector();

  if (previewMode || token.startsWith("preview_")) {
    const expiresAt = expiresAtFromShareExpiryPayload(expiryPayload);
    const nextShares = (getShareState(fileId).shares ?? []).map((share) => (share.token === token ? { ...share, expiresAt } : share));
    shareByFileId.set(fileId, { ...getShareState(fileId), shares: nextShares, message: "Share expiration updated.", error: null });
    renderInspector();
    showToast("已更新");
    return;
  }

  try {
    const response = await fetchJson<{ share: FileShareRecord }>(
      `/api/files/${encodeURIComponent(fileId)}/shares/${encodeURIComponent(token)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(expiryPayload),
      }
    );
    const nextShares = (getShareState(fileId).shares ?? []).map((share) => (share.token === token ? response.share : share));
    shareByFileId.set(fileId, { ...getShareState(fileId), shares: nextShares, message: "Share expiration updated.", error: null });
    showToast("已更新");
  } catch (error) {
    shareByFileId.set(fileId, { ...getShareState(fileId), message: null, error: errorMessage(error) });
    showToast("更新失败", "error");
  }
  renderInspector();
}

async function deleteManagedShare(token: string): Promise<void> {
  const fileId = selectedFileId;
  if (!fileId) return;
  if (!canWriteCurrentAccess()) return;
  const state = getShareState(fileId);
  shareByFileId.set(fileId, { ...state, message: "Deleting share link...", error: null });
  renderInspector();

  if (previewMode || token.startsWith("preview_")) {
    shareByFileId.set(fileId, { ...getShareState(fileId), shares: [], link: null, message: "Share link deleted.", error: null });
    renderInspector();
    showToast("已删除");
    return;
  }

  try {
    await fetchJson<{ status: string; token: string }>(`/api/files/${encodeURIComponent(fileId)}/shares/${encodeURIComponent(token)}`, {
      method: "DELETE",
    });
    const nextShares = (getShareState(fileId).shares ?? []).filter((share) => share.token !== token);
    shareByFileId.set(fileId, { ...getShareState(fileId), shares: nextShares, message: "Share link deleted.", error: null });
    showToast("已删除");
  } catch (error) {
    shareByFileId.set(fileId, { ...getShareState(fileId), message: null, error: errorMessage(error) });
    showToast("删除失败", "error");
  }
  renderInspector();
}

async function copyManagedShareLink(token: string): Promise<void> {
  const fileId = selectedFileId;
  if (!fileId) return;
  const state = getShareState(fileId);
  const share = (state.shares ?? []).find((entry) => entry.token === token);
  try {
    await navigator.clipboard.writeText(formatShareUrl(window.location.href, token, share?.isPublic ?? false));
    shareByFileId.set(fileId, { ...state, message: "Copied.", error: null });
    showToast("已复制");
  } catch {
    shareByFileId.set(fileId, { ...state, message: "Copy failed.", error: null });
    showToast("复制失败", "error");
  }
  renderInspector();
}

function getShareState(fileId: string): ShareUiState {
  return (
    shareByFileId.get(fileId) ?? {
      loading: false,
      link: null,
      message: null,
      error: null,
      shares: null,
      listLoading: false,
      listError: null,
    }
  );
}

async function copySelectedShareLink(): Promise<void> {
  const fileId = selectedFileId;
  if (!fileId) return;
  const state = shareByFileId.get(fileId);
  if (!state?.link) return;
  try {
    await navigator.clipboard.writeText(state.link);
    shareByFileId.set(fileId, { ...state, message: "Copied.", error: null });
    showToast("已复制");
  } catch {
    document.querySelector<HTMLInputElement>("[data-cv-share-link]")?.select();
    shareByFileId.set(fileId, { ...state, message: "Link selected.", error: null });
    showToast("已选中链接");
  }
  renderInspector();
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

function normalizeActorAccess(value: ActorAccess | null | undefined, actorEmail: string): ActorAccess {
  if (!value) {
    return {
      actorEmail,
      roleId: "role_external",
      roleName: "Common_Out",
      permission: "none",
      canManageRoles: false,
    };
  }
  return {
    actorEmail: normalizeActorEmail(value.actorEmail || actorEmail, actorEmail || ""),
    roleId: value.roleId || "role_external",
    roleName: value.roleName || "Common_Out",
    permission: normalizePermission(value.permission),
    canManageRoles: value.canManageRoles === true,
  };
}

function normalizePermission(value: unknown): FilePermissionLevel {
  return value === "none" || value === "read" || value === "write" ? value : "read";
}

function canReadCurrentAccess(): boolean {
  return currentActorAccess.permission === "read" || currentActorAccess.permission === "write";
}

function canWriteCurrentAccess(): boolean {
  return currentActorAccess.permission === "write";
}

function uploadAccessPayload(): { visibility: FileVisibility; roleIds: string[] } {
  const allowedRoleIds = new Set(selectableUploadRolePolicies().map((role) => role.id));
  const roleIds = Array.from(uploadRoleIds).filter((roleId) => allowedRoleIds.has(roleId));
  if (uploadVisibility === "public" && !currentActorAccess.canManageRoles) {
    return { visibility: "private", roleIds: [] };
  }
  return {
    visibility: uploadVisibility,
    roleIds: uploadVisibility === "roles" ? roleIds : [],
  };
}

function permissionLabel(permission: FilePermissionLevel): string {
  if (permission === "none") return "不可读";
  if (permission === "read") return "只读";
  return "读写";
}

function roleDescription(role: FileRolePolicy): string {
  if (role.scope === "owner") return "Owner / Super";
  if (role.scope === "domain") return `${role.domain || "domain"} ChemVault User`;
  return "External ChemVault User";
}

function fileVisibilityLabel(fileRecord: Pick<FileRecord, "visibility" | "roleIds">): string {
  if (fileRecord.visibility === "private") return "Private";
  if (fileRecord.visibility === "public") return "Public";
  const names = fileRecord.roleIds
    .map((roleId) => rolePolicies.find((role) => role.id === roleId)?.name || fallbackRolePolicies().find((role) => role.id === roleId)?.name || roleId)
    .join(", ");
  return names ? `Selected roles: ${names}` : "Selected roles";
}

function visibleRolePolicies(): FileRolePolicy[] {
  const roles = rolePolicies.length ? rolePolicies : fallbackRolePolicies();
  if (currentActorAccess.canManageRoles) return roles;
  const currentRole = roles.find((role) => role.id === currentActorAccess.roleId);
  return currentRole ? [currentRole] : [currentActorRolePolicy()];
}

function selectableUploadRolePolicies(): FileRolePolicy[] {
  return visibleRolePolicies().filter((role) => role.scope !== "owner");
}

function syncUploadRoleSelection(): void {
  if (uploadVisibility === "public" && !currentActorAccess.canManageRoles) {
    uploadVisibility = "private";
  }
  const selectableRoles = selectableUploadRolePolicies();
  const selectableRoleIds = new Set(selectableRoles.map((role) => role.id));
  uploadRoleIds = new Set(Array.from(uploadRoleIds).filter((roleId) => selectableRoleIds.has(roleId)));

  if (uploadVisibility === "roles" && !currentActorAccess.canManageRoles && selectableRoleIds.has(currentActorAccess.roleId)) {
    uploadRoleIds = new Set([currentActorAccess.roleId]);
  }
}

function currentActorRolePolicy(): FileRolePolicy {
  const now = "2026-06-18T00:00:00.000Z";
  return {
    id: currentActorAccess.roleId,
    name: currentActorAccess.roleName,
    description: "Current ChemVault User file role.",
    scope: "external",
    domain: null,
    permission: currentActorAccess.permission,
    isDefault: false,
    createdAt: now,
    updatedAt: now,
  };
}

function fallbackRolePolicies(): FileRolePolicy[] {
  const now = "2026-06-18T00:00:00.000Z";
  return [
    {
      id: "role_super",
      name: "Super",
      description: "Owner role with full file access.",
      scope: "owner",
      domain: null,
      permission: "write",
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "role_internal",
      name: "Common_In",
      description: "ChemVault User accounts from the ChemVault domain.",
      scope: "domain",
      domain: "chemvault.science",
      permission: "read",
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "role_external",
      name: "Common_Out",
      description: "External ChemVault User accounts.",
      scope: "external",
      domain: null,
      permission: "read",
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    },
  ];
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

const modalCloseTimers = new WeakMap<HTMLElement, number>();
const modalCloseListeners = new WeakMap<HTMLElement, (event: TransitionEvent) => void>();
const modalCloseTokens = new WeakMap<HTMLElement, symbol>();

function clearModalClose(modal: HTMLElement): void {
  const timer = modalCloseTimers.get(modal);
  if (timer !== undefined) window.clearTimeout(timer);
  modalCloseTimers.delete(modal);

  const listener = modalCloseListeners.get(modal);
  if (listener) modal.removeEventListener("transitionend", listener);
  modalCloseListeners.delete(modal);
  modalCloseTokens.delete(modal);
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function modalState(modal: HTMLElement): ModalMotionState {
  const value = modal.dataset.cvModalState;
  return value === "opening" || value === "open" || value === "closing" ? value : "closed";
}

function openModal(modal: HTMLElement, focusSelector: string): void {
  clearModalClose(modal);

  const current = modalState(modal);
  if (current === "open" || current === "opening") return;

  modal.dataset.cvModalState = nextModalMotionState(current, "open");
  modal.hidden = false;
  requestAnimationFrame(() => {
    if (modalState(modal) === "opening") {
      modal.dataset.cvModalState = nextModalMotionState("opening", "opened");
    }
    modal.querySelector<HTMLElement>(focusSelector)?.focus();
  });
}

function closeModal(modal: HTMLElement): void {
  const current = modalState(modal);
  const next = nextModalMotionState(current, "close");
  if (next === current) return;

  modal.dataset.cvModalState = next;
  const closeToken = Symbol();
  modalCloseTokens.set(modal, closeToken);
  const finish = () => {
    if (modalCloseTokens.get(modal) !== closeToken || modalState(modal) !== "closing") return;
    clearModalClose(modal);
    modal.hidden = true;
    modal.dataset.cvModalState = nextModalMotionState("closing", "closed");
  };

  const delay = closeDelayForMotion(prefersReducedMotion());
  if (delay === 0) {
    finish();
    return;
  }

  const onTransitionEnd = (event: TransitionEvent) => {
    if (event.target === modal && event.propertyName === "opacity") finish();
  };
  modalCloseListeners.set(modal, onTransitionEnd);
  modal.addEventListener("transitionend", onTransitionEnd);
  modalCloseTimers.set(modal, window.setTimeout(finish, delay + 80));
}

function openAuthModal(): void {
  const modal = document.querySelector<HTMLElement>("[data-cv-auth-modal]");
  if (!modal) return;
  renderAccountIdentity();
  openModal(modal, "[data-cv-auth-email]");
}

function closeAuthModal(): void {
  const modal = document.querySelector<HTMLElement>("[data-cv-auth-modal]");
  if (modal) closeModal(modal);
}

async function signOutCurrentUser(): Promise<void> {
  try {
    const response = await fetchJson<{ loginUrl?: string }>("/api/auth/logout", { method: "POST" });
    window.location.assign(response.loginUrl || currentLoginUrl || userLoginUrl(window.location.href));
  } catch {
    window.location.assign(currentLoginUrl || userLoginUrl(window.location.href));
  }
}

function openRoleModal(): void {
  const modal = document.querySelector<HTMLElement>("[data-cv-role-modal]");
  if (!modal) return;
  renderAccountIdentity();
  void loadRoleSettings();
  openModal(modal, "[data-cv-role-permission]:not(:disabled)");
}

function closeRoleModal(): void {
  const modal = document.querySelector<HTMLElement>("[data-cv-role-modal]");
  if (modal) closeModal(modal);
}

function openUploadModal(options: { reset?: boolean } = {}): void {
  const modal = document.querySelector<HTMLElement>("[data-cv-upload-modal]");
  if (!modal) return;
  if (options.reset) resetUploadModalState(modal);
  renderQueue();
  renderUploadAccessControls();
  void loadRoleSettings();
  openModal(modal, "[data-cv-file-picker]");
}

function resetUploadModalState(modal: HTMLElement): void {
  uploadQueue = reduceUploadQueue(uploadQueue, { type: "clear" });
  uploadVisibility = "private";
  uploadRoleIds = new Set(selectableUploadRolePolicies().map((role) => role.id));
  modal.querySelectorAll<HTMLInputElement>("[data-cv-file-input], [data-cv-folder-input]").forEach((input) => {
    input.value = "";
  });
}

function closeUploadModal(): void {
  const modal = document.querySelector<HTMLElement>("[data-cv-upload-modal]");
  if (modal) closeModal(modal);
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

function spinnerIcon(): string {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 1-8.5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>`;
}

function fileIcon(): string {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h6l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 6 20V5A1.5 1.5 0 0 1 7.5 3.5Zm6 0V8h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /></svg>`;
}

function starIcon(): string {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.8 2.5 5.1 5.6.8-4.1 4 1 5.6-5-2.6-5 2.6 1-5.6-4.1-4 5.6-.8L12 3.8Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /></svg>`;
}

function moreIcon(): string {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6.5h.01M12 12h.01M12 17.5h.01" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" /></svg>`;
}

function trashIcon(): string {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11v6m6-6v6M5 7h14m-2 0-.8 12.2A2 2 0 0 1 14.2 21H9.8a2 2 0 0 1-2-1.8L7 7m3-3h4l1 3H9l1-3Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>`;
}
