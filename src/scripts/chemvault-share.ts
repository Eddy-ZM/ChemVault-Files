import { formatBytes } from "../lib/chemvault-files/client-state";
import type { SharePublicResponse } from "../lib/chemvault-files/types";

export function bootChemVaultShare(): void {
  const root = document.querySelector<HTMLElement>("[data-cv-share-page]");
  if (!root || root.dataset.cvBooted === "true") return;
  root.dataset.cvBooted = "true";
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
    const response = await fetch(`/api/shares/${encodeURIComponent(token)}`);
    const payload = (await response.json()) as SharePublicResponse | { error?: { message?: string } };
    const errorPayload = "error" in payload ? payload.error : null;
    if (!response.ok || errorPayload) throw new Error(errorPayload?.message || `${response.status} ${response.statusText}`);
    container.innerHTML = renderShare(payload as SharePublicResponse);
  } catch (error) {
    container.innerHTML = renderShareError(error instanceof Error ? error.message : "Share link failed.");
  }
}

function renderShare(share: SharePublicResponse): string {
  return `
    <header class="share-view__header">
      <span class="file-type-icon" data-ext="${escapeAttr(extensionForName(share.file.displayName))}">${escapeHtml(extensionForName(share.file.displayName))}</span>
      <div>
        <h1>${escapeHtml(share.file.displayName)}</h1>
        <p>${escapeHtml(formatBytes(share.file.sizeBytes))} · expires ${escapeHtml(formatDate(share.share.expiresAt))}</p>
      </div>
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
  if (share.file.previewKind === "unsupported") {
    return `<div class="preview-empty">${fileIcon()}<strong>No inline preview</strong><span>${escapeHtml(share.file.mimeType || "file")}</span></div>`;
  }
  if (share.file.previewKind === "image") {
    return `<figure class="preview-pane share-preview"><img class="preview-image" src="${escapeAttr(share.previewUrl)}" alt="${escapeAttr(share.file.displayName)}" /></figure>`;
  }
  return `<section class="preview-pane share-preview"><iframe class="preview-frame" src="${escapeAttr(share.previewUrl)}" title="${escapeAttr(share.file.displayName)} preview"></iframe></section>`;
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
