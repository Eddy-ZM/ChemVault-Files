import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isProtectedSharePreview } from "../src/scripts/chemvault-share";
import type { SharePublicResponse } from "../src/lib/chemvault-files/types";

const appShellSource = readFileSync(new URL("../src/components/AppShell.astro", import.meta.url), "utf8");
const filesClientSource = readFileSync(new URL("../src/scripts/chemvault-files.ts", import.meta.url), "utf8");
const shareClientSource = readFileSync(new URL("../src/scripts/chemvault-share.ts", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../src/styles/chemvault-files.css", import.meta.url), "utf8");

describe("share link UI feedback", () => {
  it("renders a toast live region for share actions", () => {
    expect(appShellSource).toContain("data-cv-toast-region");
    expect(stylesSource).toContain(".toast-region");
    expect(stylesSource).toContain("@keyframes toast-enter");
  });

  it("announces concrete share actions after button clicks", () => {
    expect(filesClientSource).toContain('showToast("已复制")');
    expect(filesClientSource).toContain('showToast("已更新")');
    expect(filesClientSource).toContain('showToast("已删除")');
    expect(filesClientSource).toContain('showToast("链接已创建")');
  });

  it("keeps read-only PDF previews visible while retaining guarded behavior", () => {
    expect(shareClientSource).toContain('sandbox="allow-scripts allow-same-origin"');
    expect(stylesSource).toContain(".protected-preview__overlay span");
    expect(stylesSource).toContain("border-radius: 999px");
    expect(stylesSource).not.toContain("transform: rotate(-18deg)");
  });

  it("does not protect public read-only share previews", () => {
    const share: SharePublicResponse = {
      file: {
        id: "file_1",
        displayName: "report.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024,
        previewKind: "pdf",
      },
      share: {
        token: "sh_public",
        allowDownload: false,
        isPublic: true,
        expiresAt: "2099-01-01T00:00:00.000Z",
        createdAt: "2026-07-03T00:00:00.000Z",
      },
      previewUrl: "/api/shares/sh_public/preview",
      downloadUrl: null,
    };

    expect(isProtectedSharePreview(share)).toBe(false);
    expect(isProtectedSharePreview({ ...share, share: { ...share.share, isPublic: false } })).toBe(true);
    expect(isProtectedSharePreview({ ...share, downloadUrl: "/api/shares/sh_public/download" })).toBe(false);
  });
});
