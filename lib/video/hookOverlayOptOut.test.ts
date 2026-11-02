import { describe, it, expect } from "vitest";
import { hookOverlayExplicitlyOff, hookOverlayEnabled } from "./hookOverlayPipeline";
describe("per-character overlay opt-out", () => {
  it("explicit false opts out; missing/true does not", () => {
    expect(hookOverlayExplicitlyOff({ hook_overlay_v1: false })).toBe(true);
    expect(hookOverlayExplicitlyOff({ hook_overlay_v1: true })).toBe(false);
    expect(hookOverlayExplicitlyOff({})).toBe(false);
    expect(hookOverlayExplicitlyOff(null)).toBe(false);
    expect(hookOverlayEnabled(false, {})).toBe(false);
  });
});
