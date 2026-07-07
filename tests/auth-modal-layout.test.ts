import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appShellSource = readFileSync(new URL("../src/components/AppShell.astro", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../src/styles/chemvault-files.css", import.meta.url), "utf8");

describe("account auth modal layout", () => {
  it("keeps account action labels readable without horizontal overflow", () => {
    expect(appShellSource).toContain("Sign in through User Center");
    expect(appShellSource).toContain("Use this account");
    expect(appShellSource).not.toContain("Continue as current user");
    expect(appShellSource).toContain("data-cv-logout-button");
    expect(stylesSource).toContain("[hidden]");
    expect(stylesSource).toContain("display: none !important");
    expect(stylesSource).toContain("width: min(560px, calc(100vw - 32px))");
    expect(stylesSource).toContain("overflow-x: hidden");
    expect(stylesSource).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(stylesSource).toContain("white-space: normal");
    expect(stylesSource).toContain(".auth-actions [data-cv-logout-button]");
    expect(stylesSource).toContain("@media (max-width: 640px)");
  });
});
