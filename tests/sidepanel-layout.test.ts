import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appShellSource = readFileSync(new URL("../src/components/AppShell.astro", import.meta.url), "utf8");
const sidebarSource = readFileSync(new URL("../src/components/Sidebar.astro", import.meta.url), "utf8");
const clientSource = readFileSync(new URL("../src/scripts/chemvault-files.ts", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../src/styles/chemvault-files.css", import.meta.url), "utf8");

describe("collapsible side panel layout", () => {
  it("starts with compact side panels and exposes topbar controls", () => {
    expect(appShellSource).toContain('data-cv-sidebar-collapsed="true"');
    expect(appShellSource).toContain('data-cv-inspector-collapsed="true"');
    expect(appShellSource).toContain("data-cv-sidebar-toggle");
    expect(appShellSource).toContain("data-cv-inspector-toggle");
    expect(appShellSource).toContain("data-cv-sidepanel-scrim");
    expect(appShellSource).toContain("data-cv-toast-region");
    expect(appShellSource).toContain("© 2026 ChemVault. All rights reserved.");
    expect(appShellSource).toContain("data-cv-footer-account");
    expect(appShellSource).toContain("data-cv-footer-access");
    expect(sidebarSource).toContain('id="file-sidebar"');
    expect(sidebarSource).toContain("data-cv-rail-label");
    expect(sidebarSource).toContain('data-cv-sidebar-action="upload"');
    expect(sidebarSource).toContain('data-cv-sidebar-action="new-folder"');
    expect(sidebarSource).toContain('data-cv-nav="recent"');
    expect(sidebarSource).toContain('data-cv-nav="shared"');
    expect(sidebarSource).not.toContain('aria-label="Create project"');
    expect(sidebarSource).not.toContain('aria-label="Create folder"');
    expect(sidebarSource).not.toContain("data-cv-new-tag");
    expect(appShellSource).toContain("data-cv-folder-modal");
  });

  it("keeps the workspace fluid while side panels collapse", () => {
    expect(stylesSource).toContain("--cv-sidebar-collapsed-width: 56px");
    expect(stylesSource).toContain('grid-template-columns: var(--cv-sidebar-width) minmax(0, 1fr) var(--cv-inspector-width)');
    expect(stylesSource).toContain('.files-shell[data-cv-sidebar-collapsed="true"] .files-workbench');
    expect(stylesSource).toContain('.files-shell[data-cv-inspector-collapsed="true"] .files-workbench');
    expect(stylesSource).toContain("@media (max-width: 1100px)");
    expect(stylesSource).toContain("@keyframes sidepanel-scrim-in");
    expect(stylesSource).toContain(".folder-children");
    expect(stylesSource).toContain("border-left: 1px solid #dbe5f0");
    expect(stylesSource).toContain(".nav-row[aria-current=\"page\"]");
    expect(stylesSource).toContain(".sidebar-action--primary");
    expect(stylesSource).toContain(".files-shell[data-cv-sidebar-collapsed=\"true\"] .sidebar-action");
    expect(stylesSource).toContain("grid-template-rows: 60px minmax(0, 1fr) 34px");
    expect(stylesSource).toContain(".files-footer");
    expect(stylesSource).toContain("font-size: 11px");
  });

  it("persists side panel state and reopens the inspector on file selection", () => {
    expect(clientSource).toContain("chemvault-files:sidebar-collapsed");
    expect(clientSource).toContain("chemvault-files:inspector-collapsed");
    expect(clientSource).toContain("function updateSidePanels");
    expect(clientSource).toContain("function toggleSidebar");
    expect(clientSource).toContain("function toggleInspector");
    expect(clientSource).toContain('nextInspectorPanelCollapsed(inspectorCollapsed, "select-file")');
    expect(clientSource).toContain("function showToast");
    expect(clientSource).toContain("footerAccountLabel");
    expect(clientSource).toContain("[data-cv-footer-access]");
  });
});
