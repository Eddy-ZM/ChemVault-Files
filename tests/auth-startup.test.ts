import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appShellSource = readFileSync(new URL("../src/components/AppShell.astro", import.meta.url), "utf8");
const clientSource = readFileSync(new URL("../src/scripts/chemvault-files.ts", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../src/styles/chemvault-files.css", import.meta.url), "utf8");

describe("authenticated startup", () => {
  it("keeps the file workbench hidden until ChemVault User auth is checked", () => {
    expect(appShellSource).toContain('data-cv-auth-state="checking"');
    expect(appShellSource).toContain("data-cv-auth-gate");
    expect(appShellSource).toContain("auth-gate__folder");
    expect(appShellSource).toContain("auth-gate__key");
    expect(appShellSource).toContain(">loading</span>");
    expect(stylesSource).toContain('.files-shell[data-cv-auth-state="checking"] .files-workbench');
    expect(stylesSource).toContain("@keyframes auth-gate-folder-scan");
    expect(stylesSource).toContain("@keyframes auth-gate-key-unlock");
    expect(clientSource).toContain('setShellAuthState("checking")');
    expect(clientSource).toContain('setAuthGateMessage("loading")');
    expect(clientSource).toContain('authAwareApiUrl("/api/health")');
    expect(clientSource).toContain("window.location.replace(currentLoginUrl)");
    expect(clientSource).not.toContain("Checking ChemVault User sign-in");
    expect(clientSource).not.toMatch(/renderAll\(\);\s*void loadRemoteState\(\);/);
  });
});
