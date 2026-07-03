import { formatBytes } from "../lib/chemvault-files/client-state";
import type { SharePublicResponse } from "../lib/chemvault-files/types";

export function bootChemVaultShare(): void {
  const root = document.querySelector<HTMLElement>("[data-cv-share-page]");
  if (!root || root.dataset.cvBooted === "true") return;
  root.dataset.cvBooted = "true";
  bindProtectedPreviewGuards();
  void loadShare();
}

async function loadShare(): Promise<void> {
  const container = document.querySelector<HTMLElement>("[data-cv-share-view]");
  if (!container) return;
  const token = new URL(window.location.href).searchParams.get("token") || "";
  if (!token) {
    container.innerHTML = renderShareError("Share token is missing.");
    return;
  }
  if (token.startsWith("preview_")) {
    container.innerHTML = renderShareError("Local preview links are not public share links.");
    return;
  }

  try {
    const response = await fetch(authAwareShareApiUrl(token));
    const payload = (await response.json()) as SharePublicResponse | { error?: { message?: string; loginUrl?: string } };
    const errorPayload = "error" in payload ? payload.error : null;
    if (response.status === 401 && errorPayload?.loginUrl) {
      window.location.assign(errorPayload.loginUrl);
      return;
    }
    if (!response.ok || errorPayload) throw new Error(errorPayload?.message || `${response.status} ${response.statusText}`);
    const share = payload as SharePublicResponse;
    setProtectedPreviewMode(isProtectedSharePreview(share));
    container.innerHTML = renderShare(share);
  } catch (error) {
    setProtectedPreviewMode(false);
    container.innerHTML = renderShareError(error instanceof Error ? error.message : "Share link failed.");
  }
}

function authAwareShareApiUrl(token: string): string {
  const url = new URL(`/api/shares/${encodeURIComponent(token)}`, window.location.origin);
  url.searchParams.set("returnTo", window.location.href);
  return `${url.pathname}${url.search}`;
}

function renderShare(share: SharePublicResponse): string {
  return `
    <header class="share-view__header">
      <span class="file-type-icon" data-ext="${escapeAttr(extensionForName(share.file.displayName))}">${escapeHtml(extensionForName(share.file.displayName))}</span>
      <div>
        <h1>${escapeHtml(share.file.displayName)}</h1>
        <p>${escapeHtml(formatBytes(share.file.sizeBytes))} · expires ${escapeHtml(formatDate(share.share.expiresAt))}</p>
      </div>
      <span class="share-badge ${share.share.isPublic ? "share-badge--public" : ""}">${share.share.isPublic ? "Public link" : "ChemVault User sign-in required"}</span>
      ${
        share.downloadUrl
          ? `<a class="button button--primary" href="${escapeAttr(share.downloadUrl)}">Download</a>`
          : `<span class="share-badge">Read-only</span>`
      }
    </header>
    ${renderPreview(share)}
  `;
}

function renderPreview(share: SharePublicResponse): string {
  if (!share.previewUrl) {
    return `<div class="preview-empty">${fileIcon()}<strong>No inline preview</strong><span>${escapeHtml(share.file.mimeType || "file")}</span></div>`;
  }
  if (share.file.previewKind === "unsupported") {
    return `<div class="preview-empty">${fileIcon()}<strong>No inline preview</strong><span>${escapeHtml(share.file.mimeType || "file")}</span></div>`;
  }
  const protectedMode = isProtectedSharePreview(share);
  const protectedOverlay = protectedMode
    ? `<div class="protected-preview__overlay" aria-hidden="true"><span>Read-only preview · ${escapeHtml(share.share.token.slice(0, 12))}</span></div>`
    : "";
  const protectedClass = protectedMode ? " protected-preview" : "";
  if (share.file.previewKind === "image") {
    return `<figure class="preview-pane share-preview${protectedClass}" data-cv-protected-preview="${protectedMode ? "true" : "false"}"><img class="preview-image" src="${escapeAttr(share.previewUrl)}" alt="${escapeAttr(share.file.displayName)}" draggable="false" />${protectedOverlay}</figure>`;
  }
  const sandbox = protectedMode ? ` sandbox="allow-scripts allow-same-origin" referrerpolicy="no-referrer"` : "";
  const previewUrl = protectedMode && share.file.previewKind === "pdf" ? `${share.previewUrl}#toolbar=0&navpanes=0&view=FitH` : share.previewUrl;
  return `<section class="preview-pane share-preview${protectedClass}" data-cv-protected-preview="${protectedMode ? "true" : "false"}"><iframe class="preview-frame" src="${escapeAttr(previewUrl)}" title="${escapeAttr(share.file.displayName)} preview"${sandbox}></iframe>${protectedOverlay}</section>`;
}

export function isProtectedSharePreview(share: SharePublicResponse): boolean {
  return !share.share.isPublic && !share.downloadUrl;
}

function setProtectedPreviewMode(enabled: boolean): void {
  document.body.classList.toggle("share-body--protected", enabled);
  document.querySelector<HTMLElement>("[data-cv-share-page]")?.classList.toggle("is-protected-share", enabled);
}

function bindProtectedPreviewGuards(): void {
  document.addEventListener("contextmenu", (event) => {
    if (document.body.classList.contains("share-body--protected")) event.preventDefault();
  });
  document.addEventListener("dragstart", (event) => {
    if (document.body.classList.contains("share-body--protected")) event.preventDefault();
  });
  document.addEventListener("copy", (event) => {
    if (document.body.classList.contains("share-body--protected")) event.preventDefault();
  });
  window.addEventListener("keydown", (event) => {
    if (!document.body.classList.contains("share-body--protected")) return;
    const key = event.key.toLowerCase();
    if ((event.metaKey || event.ctrlKey) && ["c", "p", "s"].includes(key)) {
      event.preventDefault();
    }
    if (key === "printscreen") {
      event.preventDefault();
    }
  });
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function extensionForName(name: string): string {
  const extension = name.includes(".") ? name.split(".").pop() || "FILE" : "FILE";
  return extension.slice(0, 5).toUpperCase();
}

function renderShareError(message: string): string {
  return `<div class="preview-empty">${fileIcon()}<strong>Share unavailable</strong><span>${escapeHtml(message)}</span></div>`;
}

function fileIcon(): string {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h6l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 6 20V5A1.5 1.5 0 0 1 7.5 3.5Zm6 0V8h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /></svg>`;
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
