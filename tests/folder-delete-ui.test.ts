import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const script = readFileSync("src/scripts/chemvault-files.ts", "utf8");

function between(start: string, end: string): string {
  const startIndex = script.indexOf(start);
  const endIndex = script.indexOf(end, startIndex);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return script.slice(startIndex, endIndex);
}

describe("folder delete UI", () => {
  it("renders delete controls in the main file browser grid and list", () => {
    const deleteButtonRenderer = between("function renderFolderDeleteButton", "function renderFileListFileRow");
    expect(deleteButtonRenderer).toContain("data-cv-delete-folder-id");

    const gridFolderBranch = between('if (item.kind === "folder")', "const ext = extensionForFile");
    expect(gridFolderBranch).toContain("file-os-item__delete");
    expect(gridFolderBranch).toContain("renderFolderDeleteButton(item.id");

    const listContainerRenderer = between("function renderFileListContainerRow", "function renderFileListFileRow");
    expect(listContainerRenderer).toContain("file-list-delete-button");
    expect(listContainerRenderer).toContain("renderFolderDeleteButton(folderId");
  });

  it("handles folder delete clicks before folder navigation", () => {
    const workspaceHandler = between('document.querySelector<HTMLElement>("[data-cv-workspace]")', 'const quickFilter = target.closest<HTMLElement>("[data-cv-quick-filter]")');
    expect(workspaceHandler.indexOf("[data-cv-delete-folder-id]")).toBeGreaterThanOrEqual(0);
    expect(workspaceHandler.indexOf("[data-cv-delete-folder-id]")).toBeLessThan(workspaceHandler.indexOf("[data-cv-browser-folder-id]"));
    expect(script).toContain("function handleFolderDeleteClick");
    expect(script).toContain("event.preventDefault()");
    expect(script).toContain("event.stopPropagation()");
  });
});
