export const MODAL_CLOSE_DURATION_MS = 220;

export type ModalMotionState = "closed" | "opening" | "open" | "closing";
export type ModalMotionEvent = "open" | "opened" | "close" | "closed";

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
