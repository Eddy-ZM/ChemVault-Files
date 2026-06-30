import { describe, expect, it } from "vitest";
import {
  MODAL_CLOSE_DURATION_MS,
  closeDelayForMotion,
  inspectorTabDirection,
  isTreeNodeExpanded,
  nextInspectorTabMotion,
  nextInspectorPanelCollapsed,
  nextModalMotionState,
  nextSidePanelCollapsed,
  nextWorkspaceView,
  toggleCollapsedId,
} from "../src/lib/chemvault-files/motion";

describe("interface motion state", () => {
  it("moves a modal through open and close lifecycle states", () => {
    expect(nextModalMotionState("closed", "open")).toBe("opening");
    expect(nextModalMotionState("opening", "opened")).toBe("open");
    expect(nextModalMotionState("open", "close")).toBe("closing");
    expect(nextModalMotionState("closing", "closed")).toBe("closed");
    expect(nextModalMotionState("closing", "open")).toBe("opening");
    expect(nextModalMotionState("opening", "closed")).toBe("opening");
  });

  it("does not delay a modal close when reduced motion is requested", () => {
    expect(closeDelayForMotion(false)).toBe(MODAL_CLOSE_DURATION_MS);
    expect(closeDelayForMotion(true)).toBe(0);
  });

  it("adds and removes a collapsed tree identifier without mutating the input", () => {
    const collapsed = new Set<string>(["folder_spectra"]);
    expect(toggleCollapsedId(collapsed, "folder_spectra")).toEqual(new Set());
    expect(toggleCollapsedId(collapsed, "folder_datasets")).toEqual(new Set(["folder_spectra", "folder_datasets"]));
    expect(collapsed).toEqual(new Set(["folder_spectra"]));
  });

  it("reports project and folder expansion from their independent collapsed sets", () => {
    const collapsedProjects = toggleCollapsedId(new Set(), "project_spectra");
    const collapsedFolders = toggleCollapsedId(new Set(), "folder_spectra");
    expect(isTreeNodeExpanded(collapsedProjects, "project_spectra")).toBe(false);
    expect(isTreeNodeExpanded(collapsedFolders, "folder_spectra")).toBe(false);
    expect(isTreeNodeExpanded(collapsedProjects, "project_datasets")).toBe(true);
  });

  it("keeps the inspector closed until a file selection reopens it", () => {
    expect(nextInspectorPanelCollapsed(false, "close")).toBe(true);
    expect(nextInspectorPanelCollapsed(true, "close")).toBe(true);
    expect(nextInspectorPanelCollapsed(true, "select-file")).toBe(false);
    expect(nextInspectorPanelCollapsed(true, "open")).toBe(false);
  });

  it("toggles docked side panels between rail and expanded states", () => {
    expect(nextSidePanelCollapsed(true, "open")).toBe(false);
    expect(nextSidePanelCollapsed(false, "close")).toBe(true);
    expect(nextSidePanelCollapsed(true, "toggle")).toBe(false);
    expect(nextSidePanelCollapsed(false, "toggle")).toBe(true);
  });

  it("switches workspace views only for known surfaces", () => {
    expect(nextWorkspaceView("library", "flow")).toBe("flow");
    expect(nextWorkspaceView("flow", "insights")).toBe("insights");
    expect(nextWorkspaceView("insights", "unknown")).toBe("insights");
  });

  it("reports inspector tab transition direction for richer content animation", () => {
    expect(inspectorTabDirection("details", "preview")).toBe("forward");
    expect(inspectorTabDirection("activity", "preview")).toBe("backward");
    expect(inspectorTabDirection("preview", "preview")).toBe("none");
  });

  it("increments the inspector animation key when switching tabs", () => {
    expect(nextInspectorTabMotion("details", "preview", 3)).toEqual({
      tab: "preview",
      direction: "forward",
      sequence: 4,
    });
    expect(nextInspectorTabMotion("preview", "preview", 4)).toEqual({
      tab: "preview",
      direction: "none",
      sequence: 4,
    });
  });
});
