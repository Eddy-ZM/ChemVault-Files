import { describe, expect, it } from "vitest";
import {
  MODAL_CLOSE_DURATION_MS,
  closeDelayForMotion,
  nextModalMotionState,
  toggleCollapsedId,
} from "../src/lib/chemvault-files/motion";

describe("interface motion state", () => {
  it("moves a modal through open and close lifecycle states", () => {
    expect(nextModalMotionState("closed", "open")).toBe("opening");
    expect(nextModalMotionState("opening", "opened")).toBe("open");
    expect(nextModalMotionState("open", "close")).toBe("closing");
    expect(nextModalMotionState("closing", "closed")).toBe("closed");
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
});
