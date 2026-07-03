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
    expect(sidebarSource).toContain('id="file-sidebar"');
    expect(sidebarSource).toContain("data-cv-rail-label");
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
  });

  it("persists side panel state and reopens the inspector on file selection", () => {
    expect(clientSource).toContain("chemvault-files:sidebar-collapsed");
    expect(clientSource).toContain("chemvault-files:inspector-collapsed");
    expect(clientSource).toContain("function updateSidePanels");
    expect(clientSource).toContain("function toggleSidebar");
    expect(clientSource).toContain("function toggleInspector");
    expect(clientSource).toContain('nextInspectorPanelCollapsed(inspectorCollapsed, "select-file")');
    expect(clientSource).toContain("function showToast");
  });
});
