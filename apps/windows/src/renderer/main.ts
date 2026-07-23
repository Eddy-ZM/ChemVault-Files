import { ChemVaultApiError, ChemVaultFilesClient, type AuthTokens, type CVFile, type CVFolder, type CVStorageUsage, type DriveView } from "@chemvault/files-api-client";
import iconUrl from "./icon.png";
import "./styles.css";

type DesktopFile = { name: string; path: string; size: number; bytes: ArrayBuffer };
type ViewMode = "list" | "grid";
type SortKey = "name" | "size" | "modified" | "type";

interface DesktopBridge {
  login(): Promise<AuthTokens | null>;
  getTokens(): Promise<AuthTokens | null>;
  setTokens(tokens: AuthTokens): Promise<boolean>;
  clearTokens(): Promise<boolean>;
  openFiles(): Promise<DesktopFile[]>;
  saveFile(input: { defaultPath: string; bytes: ArrayBuffer }): Promise<string | null>;
  notify(input: { title: string; body: string }): Promise<void>;
  checkForUpdates(): Promise<{ status: string; updateInfo?: unknown }>;
  onMenuNewFolder(callback: () => void): void;
  onMenuSignOut(callback: () => void): void;
}

declare global {
  interface Window {
    chemvaultDesktop: DesktopBridge;
  }
}

const apiBaseUrl = import.meta.env.VITE_CHEMVAULT_API_BASE_URL || import.meta.env.CHEMVAULT_API_BASE_URL || "https://file.chemvault.science";
const desktop = window.chemvaultDesktop;
const appRoot = document.querySelector<HTMLDivElement>("#app")!;
let modalReturnFocus: HTMLElement | null = null;
let modalCleanup: (() => void) | null = null;

const state = {
  tokens: null as AuthTokens | null,
  section: "files" as DriveView | "settings",
  files: [] as CVFile[],
  folders: [] as CVFolder[],
  path: [] as CVFolder[],
  parentId: null as string | null,
  selectedFile: null as CVFile | null,
  query: "",
  sort: "modified" as SortKey,
  viewMode: "list" as ViewMode,
  storage: null as CVStorageUsage | null,
  loading: false,
  error: "",
  uploadProgress: null as number | null,
  toasts: [] as Array<{ id: string; message: string; kind: "ok" | "error" | "info" }>,
};

const client = new ChemVaultFilesClient({
  baseUrl: apiBaseUrl,
  getAccessToken: () => state.tokens?.accessToken ?? null,
  setTokens: async (tokens) => {
    state.tokens = tokens;
    await desktop.setTokens(tokens);
  },
});

const sections: Array<{ id: DriveView | "settings"; label: string; icon: string }> = [
  { id: "files", label: "My Files", icon: "folder" },
  { id: "recent", label: "Recent", icon: "clock" },
  { id: "starred", label: "Starred", icon: "star" },
  { id: "shared", label: "Shared with Me", icon: "users" },
  { id: "trash", label: "Recycle Bin", icon: "trash" },
  { id: "settings", label: "Settings", icon: "settings" },
];

void boot();

async function boot() {
  state.tokens = await desktop.getTokens();
  bindGlobalShortcuts();
  desktop.onMenuNewFolder(() => void createFolder());
  desktop.onMenuSignOut(() => void signOut());
  if (state.tokens) await refreshFromServer();
  render();
}

async function refreshFromServer() {
  if (!state.tokens) return;
  await run(async () => {
    if (state.section === "settings") {
      state.storage = await client.storageUsage();
      return;
    }
    if (state.query.trim()) {
      state.files = await client.searchFiles(state.query.trim());
      state.folders = [];
      return;
    }
    const response = await client.listFiles({ parentId: state.parentId, view: state.section });
    state.files = sortFiles(response.files);
    state.folders = response.folders;
    if (!state.files.some((file) => file.id === state.selectedFile?.id)) state.selectedFile = state.files[0] ?? null;
  });
}

function render() {
  appRoot.innerHTML = state.tokens ? appTemplate() : loginTemplate();
  bindHandlers();
}

function loginTemplate() {
  return `
    <main class="login-shell">
      <section class="login-panel">
        <img src="${iconUrl}" alt="" class="login-logo" />
        <p class="eyebrow">ChemVault Files</p>
        <h1>Secure cloud files for research work.</h1>
        <p class="login-copy">Sign in with ChemVault User to browse, upload, preview, share, and recover files from the desktop app.</p>
        <button class="primary" data-action="login">Sign in</button>
        ${state.error ? `<p class="error-text">${escapeHtml(state.error)}</p>` : ""}
      </section>
    </main>
  `;
}

function appTemplate() {
  if (state.section === "settings") return shellTemplate(settingsTemplate());
  const empty = !state.loading && !state.error && state.files.length === 0 && state.folders.length === 0;
  return shellTemplate(`
    <section class="content">
      <div class="breadcrumbs">
        <button data-action="root">My Files</button>
        ${state.path.map((folder, index) => `<button data-action="breadcrumb" data-index="${index}">${escapeHtml(folder.name)}</button>`).join("")}
      </div>
      ${state.uploadProgress !== null ? `<div class="upload-progress"><span style="width:${state.uploadProgress}%"></span></div>` : ""}
      ${state.loading ? skeletonTemplate() : ""}
      ${state.error ? errorTemplate(state.error) : ""}
      ${empty ? emptyTemplate() : ""}
      ${!state.loading && !state.error && !empty ? (state.viewMode === "grid" ? gridTemplate() : listTemplate()) : ""}
    </section>
    ${detailsTemplate()}
  `);
}

function shellTemplate(content: string) {
  return `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand"><img src="${iconUrl}" alt="" /><span><strong>ChemVault</strong> Files</span></div>
        <nav>
          ${sections.map((section) => `
            <button class="${state.section === section.id ? "active" : ""}" data-section="${section.id}">
              ${icon(section.icon)}<span>${section.label}</span>
            </button>
          `).join("")}
        </nav>
        ${storageMeterTemplate()}
      </aside>
      <div class="workspace">
        <header class="topbar">
          <div class="search">
            ${icon("search")}
            <input data-field="search" value="${escapeAttribute(state.query)}" placeholder="Search files" />
          </div>
          <button class="ghost" data-action="new-folder">${icon("folder-plus")}<span>New</span></button>
          <button class="primary" data-action="upload">${icon("upload")}<span>Upload</span></button>
          <select data-field="sort">
            <option value="modified" ${state.sort === "modified" ? "selected" : ""}>Modified</option>
            <option value="name" ${state.sort === "name" ? "selected" : ""}>Name</option>
            <option value="size" ${state.sort === "size" ? "selected" : ""}>Size</option>
            <option value="type" ${state.sort === "type" ? "selected" : ""}>Type</option>
          </select>
          <button class="icon-button ${state.viewMode === "list" ? "active" : ""}" data-action="list-view" title="List view">${icon("list")}</button>
          <button class="icon-button ${state.viewMode === "grid" ? "active" : ""}" data-action="grid-view" title="Grid view">${icon("grid")}</button>
          <div class="account">${escapeHtml(state.tokens?.user.email ?? "")}</div>
        </header>
        <main class="main" data-dropzone>
          ${content}
        </main>
      </div>
      <div class="toasts" role="region" aria-label="Notifications" aria-live="polite" aria-atomic="false">${toastItemsTemplate()}</div>
    </div>
  `;
}

function listTemplate() {
  return `
    <div class="file-table">
      <div class="table-head"><span>Name</span><span>Owner</span><span>Modified</span><span>Size</span><span></span></div>
      ${state.folders.map((folder) => `
        <button class="file-row folder" data-folder="${folder.id}">
          <span>${fileIcon("folder")}<strong>${escapeHtml(folder.name)}</strong></span>
          <span>${escapeHtml(folder.ownerUserId ?? "ChemVault")}</span>
          <span>${formatDate(folder.updatedAt)}</span>
          <span>Folder</span>
          <span>${icon("chevron-right")}</span>
        </button>
      `).join("")}
      ${sortFiles(state.files).map((file) => `
        <button class="file-row ${state.selectedFile?.id === file.id ? "selected" : ""}" data-file="${file.id}">
          <span>${fileIcon(file.displayName)}<strong>${escapeHtml(file.displayName)}</strong></span>
          <span>${escapeHtml(file.actorEmail ?? file.ownerUserId ?? "ChemVault")}</span>
          <span>${formatDate(file.updatedAt)}</span>
          <span>${formatBytes(file.sizeBytes)}</span>
          <span class="row-actions"><span data-more="${file.id}">${icon("more")}</span></span>
        </button>
      `).join("")}
    </div>
  `;
}

function gridTemplate() {
  return `
    <div class="file-grid">
      ${state.folders.map((folder) => `
        <button class="file-card" data-folder="${folder.id}">
          ${fileIcon("folder")}
          <strong>${escapeHtml(folder.name)}</strong>
          <span>${formatDate(folder.updatedAt)}</span>
        </button>
      `).join("")}
      ${sortFiles(state.files).map((file) => `
        <button class="file-card ${state.selectedFile?.id === file.id ? "selected" : ""}" data-file="${file.id}">
          ${fileIcon(file.displayName)}
          <strong>${escapeHtml(file.displayName)}</strong>
          <span>${formatBytes(file.sizeBytes)} · ${formatDate(file.updatedAt)}</span>
        </button>
      `).join("")}
    </div>
  `;
}

function detailsTemplate() {
  const file = state.selectedFile;
  if (!file) return `<aside class="details"><div class="muted-panel">Select a file to see details.</div></aside>`;
  return `
    <aside class="details">
      <div class="details-header">
        ${fileIcon(file.displayName)}
        <h2>${escapeHtml(file.displayName)}</h2>
        <p>${escapeHtml(typeLabel(file))} · ${formatBytes(file.sizeBytes)}</p>
      </div>
      <div class="details-actions">
        <button data-action="preview">${icon("eye")}Preview</button>
        <button data-action="download">${icon("download")}Download</button>
        <button data-action="share">${icon("share")}Share</button>
        <button data-action="star">${icon("star")}${file.isStarred ? "Unstar" : "Star"}</button>
        ${state.section === "trash" ? `<button data-action="restore">${icon("rotate")}Restore</button><button class="danger" data-action="permanent-delete">${icon("trash")}Delete</button>` : `<button class="danger" data-action="delete">${icon("trash")}Delete</button>`}
      </div>
      <dl>
        <div><dt>Type</dt><dd>${escapeHtml(typeLabel(file))}</dd></div>
        <div><dt>Owner</dt><dd>${escapeHtml(file.actorEmail ?? file.ownerUserId ?? "ChemVault")}</dd></div>
        <div><dt>Modified</dt><dd>${formatDate(file.updatedAt)}</dd></div>
        <div><dt>Created</dt><dd>${formatDate(file.createdAt)}</dd></div>
        <div><dt>Access</dt><dd>${escapeHtml(file.sharedStatus ?? file.visibility)}</dd></div>
        <div><dt>Version</dt><dd>Version history placeholder</dd></div>
      </dl>
    </aside>
  `;
}

function settingsTemplate() {
  const usage = state.storage;
  const percent = usage ? Math.min(100, Math.round((usage.usedBytes / Math.max(usage.quotaBytes, 1)) * 100)) : 0;
  return `
    <section class="content settings">
      <h1>Settings</h1>
      <p class="muted">Signed in as ${escapeHtml(state.tokens?.user.email ?? "")}</p>
      <div class="settings-grid">
        <article>
          <h2>Storage</h2>
          ${usage ? `<div class="meter"><span style="width:${percent}%"></span></div><p>${formatBytes(usage.usedBytes)} of ${formatBytes(usage.quotaBytes)} used</p>` : `<button data-action="reload">Load storage usage</button>`}
          ${usage ? `<ul>${usage.byType.map((bucket) => `<li><span>${escapeHtml(bucket.label)}</span><strong>${formatBytes(bucket.bytes)}</strong></li>`).join("")}</ul>` : ""}
        </article>
        <article>
          <h2>Updates</h2>
          <p class="muted">Windows updater is configured through CHEMVAULT_UPDATE_FEED_URL.</p>
          <button data-action="check-updates">Check for updates</button>
        </article>
        <article>
          <h2>Account</h2>
          <button class="danger" data-action="sign-out">Sign out</button>
        </article>
      </div>
    </section>
  `;
}

function storageMeterTemplate() {
  if (!state.storage) return `<div class="storage-meter"><span>Storage</span><button data-action="load-storage">Load</button></div>`;
  const percent = Math.min(100, Math.round((state.storage.usedBytes / Math.max(state.storage.quotaBytes, 1)) * 100));
  return `<div class="storage-meter"><span>${formatBytes(state.storage.usedBytes)} / ${formatBytes(state.storage.quotaBytes)}</span><div><i style="width:${percent}%"></i></div></div>`;
}

function skeletonTemplate() {
  return `<div class="skeleton">${Array.from({ length: 8 }, (_, index) => `<span style="animation-delay:${index * 60}ms"></span>`).join("")}</div>`;
}

function emptyTemplate() {
  return `<div class="empty"><div>${icon("folder")}</div><h2>No files here</h2><p>Upload files or create a folder to start organizing this space.</p></div>`;
}

function errorTemplate(message: string) {
  return `<div class="error-card"><h2>Could not load files</h2><p>${escapeHtml(message)}</p><button data-action="reload">Retry</button></div>`;
}

function bindHandlers() {
  document.querySelector('[data-action="login"]')?.addEventListener("click", () => void login());
  document.querySelectorAll<HTMLElement>("[data-section]").forEach((button) => {
    button.addEventListener("click", () => void changeSection(button.dataset.section as DriveView | "settings"));
  });
  document.querySelector('[data-action="root"]')?.addEventListener("click", () => void openRoot());
  document.querySelectorAll<HTMLElement>("[data-folder]").forEach((row) => {
    row.addEventListener("dblclick", () => void openFolder(row.dataset.folder!));
    row.addEventListener("click", () => void openFolder(row.dataset.folder!));
  });
  document.querySelectorAll<HTMLElement>("[data-file]").forEach((row) => {
    row.addEventListener("click", () => selectFile(row.dataset.file!));
    row.addEventListener("dblclick", () => void previewSelected());
  });
  document.querySelectorAll<HTMLElement>("[data-index]").forEach((button) => {
    button.addEventListener("click", () => void jumpToPath(Number(button.dataset.index)));
  });
  document.querySelector('[data-action="new-folder"]')?.addEventListener("click", () => void createFolder());
  document.querySelector('[data-action="upload"]')?.addEventListener("click", () => void uploadFromPicker());
  document.querySelector('[data-action="reload"]')?.addEventListener("click", () => void refreshFromServer());
  document.querySelector('[data-action="load-storage"]')?.addEventListener("click", () => void loadStorage());
  document.querySelector('[data-action="check-updates"]')?.addEventListener("click", () => void checkUpdates());
  document.querySelector('[data-action="sign-out"]')?.addEventListener("click", () => void signOut());
  document.querySelector('[data-action="list-view"]')?.addEventListener("click", () => { state.viewMode = "list"; render(); });
  document.querySelector('[data-action="grid-view"]')?.addEventListener("click", () => { state.viewMode = "grid"; render(); });
  document.querySelector('[data-action="preview"]')?.addEventListener("click", () => void previewSelected());
  document.querySelector('[data-action="download"]')?.addEventListener("click", () => void downloadSelected());
  document.querySelector('[data-action="share"]')?.addEventListener("click", () => void shareSelected());
  document.querySelector('[data-action="star"]')?.addEventListener("click", () => void starSelected());
  document.querySelector('[data-action="delete"]')?.addEventListener("click", () => void deleteSelected());
  document.querySelector('[data-action="restore"]')?.addEventListener("click", () => void restoreSelected());
  document.querySelector('[data-action="permanent-delete"]')?.addEventListener("click", () => void permanentlyDeleteSelected());
  document.querySelector<HTMLSelectElement>('[data-field="sort"]')?.addEventListener("change", (event) => {
    state.sort = (event.target as HTMLSelectElement).value as SortKey;
    render();
  });
  document.querySelector<HTMLInputElement>('[data-field="search"]')?.addEventListener("input", debounce((event) => {
    state.query = (event.target as HTMLInputElement).value;
    void refreshFromServer();
  }, 280));
  bindDropzone();
}

async function login() {
  await run(async () => {
    const tokens = await desktop.login();
    if (!tokens) return;
    state.tokens = tokens;
    const user = await client.me();
    state.tokens = { ...tokens, user };
    await desktop.setTokens(state.tokens);
    await loadStorage();
    await refreshFromServer();
    toast("Signed in", "ok");
  });
}

async function signOut() {
  await desktop.clearTokens();
  state.tokens = null;
  state.files = [];
  state.folders = [];
  state.selectedFile = null;
  state.storage = null;
  render();
}

async function changeSection(section: DriveView | "settings") {
  state.section = section;
  state.parentId = null;
  state.path = [];
  state.selectedFile = null;
  state.query = "";
  await refreshFromServer();
}

async function openRoot() {
  state.parentId = null;
  state.path = [];
  await refreshFromServer();
}

async function openFolder(folderId: string) {
  const folder = state.folders.find((candidate) => candidate.id === folderId);
  if (!folder) return;
  state.parentId = folder.id;
  state.path.push(folder);
  await refreshFromServer();
}

async function jumpToPath(index: number) {
  state.path = state.path.slice(0, index + 1);
  state.parentId = state.path.at(-1)?.id ?? null;
  await refreshFromServer();
}

function selectFile(fileId: string) {
  state.selectedFile = state.files.find((file) => file.id === fileId) ?? null;
  render();
}

async function createFolder() {
  const name = prompt("Folder name");
  if (!name?.trim()) return;
  const projectId = state.folders[0]?.projectId ?? state.files[0]?.projectId;
  if (!projectId) return toast("Open a project or existing folder before creating a folder.", "error");
  await run(async () => {
    await client.createFolder({ projectId, parentId: state.parentId, name: name.trim() });
    toast("Folder created", "ok");
    await refreshFromServer();
  });
}

async function uploadFromPicker() {
  const files = await desktop.openFiles();
  if (files.length === 0) return;
  await uploadDesktopFiles(files);
}

async function uploadDesktopFiles(files: DesktopFile[]) {
  const projectId = state.folders[0]?.projectId ?? state.files[0]?.projectId;
  if (!projectId) return toast("Open a project or folder before uploading.", "error");
  await run(async () => {
    let complete = 0;
    for (const file of files) {
      state.uploadProgress = Math.round((complete / files.length) * 100);
      render();
      await client.upload({
        file: new Blob([file.bytes]),
        name: file.name,
        size: file.size,
        mimeType: guessMimeType(file.name),
        projectId,
        folderId: state.parentId,
      });
      complete += 1;
    }
    state.uploadProgress = null;
    toast(files.length === 1 ? "File uploaded" : `${files.length} files uploaded`, "ok");
    await desktop.notify({ title: "ChemVault Files", body: "Upload complete" });
    await refreshFromServer();
  });
}

async function previewSelected() {
  const file = state.selectedFile;
  if (!file) return;
  await run(async () => {
    const blob = await client.preview(file.id);
    const url = URL.createObjectURL(blob);
    const label = escapeHtml(file.displayName);
    const type = typeLabel(file).toLowerCase();
    const text = type === "text" || type === "code" ? escapeHtml(await blob.text()) : "";
    const body = type === "image"
      ? `<img src="${url}" alt="${label}" />`
      : type === "pdf"
        ? `<iframe src="${url}" title="${label}"></iframe>`
        : text
          ? `<pre>${text}</pre>`
          : `<div class="preview-fallback">${fileIcon(file.displayName)}<h2>${label}</h2><p>${formatBytes(file.sizeBytes)}</p><button data-action="modal-download">Download</button></div>`;
    showModal(label, body, () => URL.revokeObjectURL(url));
    document.querySelector('[data-action="modal-download"]')?.addEventListener("click", () => void downloadSelected());
  });
}

async function downloadSelected() {
  const file = state.selectedFile;
  if (!file) return;
  await run(async () => {
    const blob = await client.download(file.id);
    await desktop.saveFile({ defaultPath: file.displayName, bytes: await blob.arrayBuffer() });
    toast("Downloaded", "ok");
  });
}

async function shareSelected() {
  const file = state.selectedFile;
  if (!file) return;
  await run(async () => {
    const response = await client.createShareLink(file.id, { allowDownload: true, isPublic: false, expiresInDays: 30 });
    await navigator.clipboard.writeText(response.shareUrl);
    toast("Share link copied", "ok");
  });
}

async function starSelected() {
  const file = state.selectedFile;
  if (!file) return;
  await run(async () => {
    await client.starFile(file.id, !(file.isStarred ?? false));
    toast(file.isStarred ? "Removed from starred" : "Added to starred", "ok");
    await refreshFromServer();
  });
}

async function deleteSelected() {
  const file = state.selectedFile;
  if (!file || !confirm(`Move "${file.displayName}" to the recycle bin?`)) return;
  await run(async () => {
    await client.deleteFile(file.id);
    toast("Moved to recycle bin", "ok");
    state.selectedFile = null;
    await refreshFromServer();
  });
}

async function restoreSelected() {
  const file = state.selectedFile;
  if (!file) return;
  await run(async () => {
    await client.restoreFile(file.id);
    toast("Restored", "ok");
    await refreshFromServer();
  });
}

async function permanentlyDeleteSelected() {
  const file = state.selectedFile;
  if (!file || !confirm(`Permanently delete "${file.displayName}"? This cannot be undone.`)) return;
  await run(async () => {
    await client.permanentlyDelete(file.id);
    toast("Permanently deleted", "ok");
    state.selectedFile = null;
    await refreshFromServer();
  });
}

async function loadStorage() {
  if (!state.tokens) return;
  await run(async () => {
    state.storage = await client.storageUsage();
  });
}

async function checkUpdates() {
  const result = await desktop.checkForUpdates();
  toast(result.status === "not-configured" ? "Update feed is not configured" : "Update check completed", "info");
}

async function run(work: () => Promise<void>) {
  state.loading = true;
  state.error = "";
  render();
  try {
    await work();
  } catch (error) {
    if (error instanceof ChemVaultApiError && error.code === "SESSION_EXPIRED" && state.tokens?.refreshToken) {
      state.tokens = await client.refresh(state.tokens.refreshToken);
      await work();
    } else {
      state.error = error instanceof Error ? error.message : "Something went wrong";
      toast(state.error, "error");
    }
  } finally {
    state.loading = false;
    render();
  }
}

function bindDropzone() {
  const dropzone = document.querySelector<HTMLElement>("[data-dropzone]");
  if (!dropzone) return;
  dropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropzone.classList.add("dragging");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragging"));
  dropzone.addEventListener("drop", async (event) => {
    event.preventDefault();
    dropzone.classList.remove("dragging");
    const files = Array.from(event.dataTransfer?.files ?? []);
    const desktopFiles = await Promise.all(files.map(async (file) => ({
      name: file.name,
      path: file.name,
      size: file.size,
      bytes: await file.arrayBuffer(),
    })));
    await uploadDesktopFiles(desktopFiles);
  });
}

function bindGlobalShortcuts() {
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeModal();
      return;
    }

    if (document.querySelector(".modal")) return;

    const isMod = event.ctrlKey || event.metaKey;
    const target = event.target;
    const isEditable = target instanceof HTMLElement && (
      target.isContentEditable || target.matches("input, textarea, select, [role='textbox']")
    );

    if (!isEditable && (event.key === "Delete" || event.key === "Backspace")) void deleteSelected();
    if (isMod && event.key.toLowerCase() === "f") {
      event.preventDefault();
      document.querySelector<HTMLInputElement>('[data-field="search"]')?.focus();
    }
    if (isMod && event.key.toLowerCase() === "n") {
      event.preventDefault();
      void createFolder();
    }
    if (isMod && event.key.toLowerCase() === "r") {
      event.preventDefault();
      void refreshFromServer();
    }
    if (!isEditable && event.key === " ") {
      event.preventDefault();
      void previewSelected();
    }
  });
}

function showModal(title: string, body: string, cleanup?: () => void) {
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `<div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="preview-modal-title" tabindex="-1"><header><h2 id="preview-modal-title">${title}</h2><button type="button" data-close aria-label="Close preview">${icon("x")}</button></header><div class="preview-body">${body}</div></div>`;
  modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  modalCleanup = cleanup ?? null;
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });
  modal.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      modal.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex='-1'])"),
    );
    if (focusable.length === 0) {
      event.preventDefault();
      modal.querySelector<HTMLElement>(".modal-panel")?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  document.body.classList.add("modal-open");
  document.body.append(modal);
  const closeButton = modal.querySelector<HTMLButtonElement>("[data-close]");
  closeButton?.addEventListener("click", closeModal);
  (closeButton ?? modal.querySelector<HTMLElement>(".modal-panel"))?.focus({ preventScroll: true });
}

function closeModal() {
  const modal = document.querySelector<HTMLElement>(".modal");
  if (!modal || modal.dataset.closing === "true") return;
  modal.dataset.closing = "true";
  modal.classList.add("is-closing");

  const finish = () => {
    modal.remove();
    document.body.classList.remove("modal-open");
    modalCleanup?.();
    modalCleanup = null;
    modalReturnFocus?.focus({ preventScroll: true });
    modalReturnFocus = null;
  };

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    finish();
    return;
  }

  modal.addEventListener("animationend", finish, { once: true });
  window.setTimeout(() => {
    if (modal.isConnected) finish();
  }, 180);
}

function toast(message: string, kind: "ok" | "error" | "info") {
  const id = crypto.randomUUID();
  state.toasts.push({ id, message, kind });
  renderToasts();
  window.setTimeout(() => {
    state.toasts = state.toasts.filter((toast) => toast.id !== id);
    renderToasts();
  }, 2600);
}

function toastItemsTemplate() {
  return state.toasts
    .map((toast) => `<div class="toast ${toast.kind}" role="${toast.kind === "error" ? "alert" : "status"}">${escapeHtml(toast.message)}</div>`)
    .join("");
}

function renderToasts() {
  const container = document.querySelector<HTMLElement>(".toasts");
  if (container) container.innerHTML = toastItemsTemplate();
}

function sortFiles(files: CVFile[]) {
  return [...files].sort((a, b) => {
    if (state.sort === "name") return a.displayName.localeCompare(b.displayName);
    if (state.sort === "size") return b.sizeBytes - a.sizeBytes;
    if (state.sort === "type") return typeLabel(a).localeCompare(typeLabel(b));
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

function typeLabel(file: CVFile) {
  const mime = file.mimeType?.toLowerCase() ?? "";
  const name = file.displayName.toLowerCase();
  if (mime.includes("pdf") || name.endsWith(".pdf")) return "PDF";
  if (mime.startsWith("image/")) return "Image";
  if (mime.includes("word") || name.endsWith(".docx")) return "Document";
  if (mime.includes("spreadsheet") || name.endsWith(".xlsx") || name.endsWith(".csv")) return "Spreadsheet";
  if (mime.includes("presentation") || name.endsWith(".pptx")) return "Presentation";
  if (name.endsWith(".zip") || name.endsWith(".7z")) return "Archive";
  if ([".ts", ".tsx", ".js", ".json", ".md", ".txt", ".py", ".swift", ".rs"].some((ext) => name.endsWith(ext))) return "Code";
  return "File";
}

function fileIcon(name: string) {
  if (name === "folder") return `<span class="file-icon folder">${icon("folder")}</span>`;
  const lower = name.toLowerCase();
  const label = lower.endsWith(".pdf") ? "PDF" : lower.endsWith(".xlsx") || lower.endsWith(".csv") ? "XLS" : lower.endsWith(".docx") ? "DOC" : lower.endsWith(".pptx") ? "PPT" : lower.match(/\.(png|jpg|jpeg|gif|webp)$/) ? "IMG" : lower.match(/\.(zip|7z|rar)$/) ? "ZIP" : lower.match(/\.(ts|tsx|js|json|md|txt|py|swift|rs)$/) ? "TXT" : "FILE";
  return `<span class="file-icon">${label}</span>`;
}

function icon(name: string) {
  const paths: Record<string, string> = {
    folder: "M3 7h6l2 2h10v10H3z",
    "folder-plus": "M3 7h6l2 2h10v10H3z M12 12v5 M9.5 14.5h5",
    upload: "M12 3v12 M7 8l5-5 5 5 M5 19h14",
    download: "M12 3v12 M7 10l5 5 5-5 M5 19h14",
    search: "M10.5 18a7.5 7.5 0 1 1 5.3-12.8 7.5 7.5 0 0 1-5.3 12.8z M16 16l5 5",
    list: "M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01",
    grid: "M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z",
    star: "M12 3l2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z",
    users: "M16 11a4 4 0 1 0-8 0 M3 21a7 7 0 0 1 14 0 M19 8a3 3 0 0 1 0 6 M21 21a5 5 0 0 0-3-4.6",
    clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2",
    trash: "M4 7h16 M10 11v6 M14 11v6 M6 7l1 14h10l1-14 M9 7V4h6v3",
    settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M4 12h2 M18 12h2 M12 4v2 M12 18v2",
    "chevron-right": "M9 6l6 6-6 6",
    more: "M5 12h.01 M12 12h.01 M19 12h.01",
    eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    share: "M4 12v7h16v-7 M12 15V3 M7 8l5-5 5 5",
    rotate: "M4 4v6h6 M20 20v-6h-6 M5 15a7 7 0 0 0 12 3 M19 9A7 7 0 0 0 7 6",
    x: "M6 6l12 12 M18 6L6 18",
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] ?? paths.folder}" /></svg>`;
}

function guessMimeType(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".txt") || lower.endsWith(".md")) return "text/plain";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".zip")) return "application/zip";
  if (lower.endsWith(".7z")) return "application/x-7z-compressed";
  if (lower.endsWith(".tar")) return "application/x-tar";
  if (lower.endsWith(".gz") || lower.endsWith(".tgz")) return "application/gzip";
  if (lower.endsWith(".dmg")) return "application/x-apple-diskimage";
  if (lower.endsWith(".msi")) return "application/x-msi";
  if (lower.endsWith(".exe")) return "application/x-msdownload";
  return "application/octet-stream";
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function debounce<T extends Event>(callback: (event: T) => void, wait: number) {
  let timer: number | undefined;
  return (event: Event) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => callback(event as T), wait);
  };
}
