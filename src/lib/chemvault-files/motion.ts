export const MODAL_CLOSE_DURATION_MS = 220;

export type ModalMotionState = "closed" | "opening" | "open" | "closing";
export type ModalMotionEvent = "open" | "opened" | "close" | "closed";
export type InspectorPanelEvent = "close" | "open" | "select-file";
export type SidePanelEvent = "close" | "open" | "toggle";
export type InspectorTab = "details" | "preview" | "activity";
export type TabMotionDirection = "forward" | "backward" | "none";
export type WorkspaceView = "library" | "flow" | "insights";

export interface InspectorTabMotionState {
  tab: InspectorTab;
  direction: TabMotionDirection;
  sequence: number;
}

export function nextModalMotionState(current: ModalMotionState, event: ModalMotionEvent): ModalMotionState {
  if (event === "open" && current !== "open") return "opening";
  if (event === "opened" && current === "opening") return "open";
  if (event === "close" && current !== "closed") return "closing";
  if (event === "closed" && current === "closing") return "closed";
  return current;
}

export function closeDelayForMotion(reduceMotion: boolean): number {
  return reduceMotion ? 0 : MODAL_CLOSE_DURATION_MS;
}

export function toggleCollapsedId(collapsedIds: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(collapsedIds);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function isTreeNodeExpanded(collapsedIds: ReadonlySet<string>, id: string): boolean {
  return !collapsedIds.has(id);
}

export function nextInspectorPanelCollapsed(_collapsed: boolean, event: InspectorPanelEvent): boolean {
  return event === "close";
}

export function nextSidePanelCollapsed(collapsed: boolean, event: SidePanelEvent): boolean {
  if (event === "open") return false;
  if (event === "close") return true;
  return !collapsed;
}

const workspaceViews: ReadonlySet<string> = new Set(["library", "flow", "insights"]);

export function nextWorkspaceView(current: WorkspaceView, requested: string | null | undefined): WorkspaceView {
  return workspaceViews.has(requested ?? "") ? (requested as WorkspaceView) : current;
}

const inspectorTabs: readonly InspectorTab[] = ["details", "preview", "activity"];

export function inspectorTabDirection(current: InspectorTab, next: InspectorTab): TabMotionDirection {
  const currentIndex = inspectorTabs.indexOf(current);
  const nextIndex = inspectorTabs.indexOf(next);
  if (currentIndex === nextIndex) return "none";
  return nextIndex > currentIndex ? "forward" : "backward";
}

export function nextInspectorTabMotion(current: InspectorTab, requested: InspectorTab, sequence: number): InspectorTabMotionState {
  const direction = inspectorTabDirection(current, requested);
  return {
    tab: requested,
    direction,
    sequence: direction === "none" ? sequence : sequence + 1,
  };
}
