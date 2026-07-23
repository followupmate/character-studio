import { describe, expect, it } from "vitest";

describe("Instagram agent dry-run contract", () => {
  it("keeps outbound delivery disabled by default", () => {
    const dryRun = process.env.IG_AGENT_DRY_RUN !== "false";
    expect(dryRun).toBe(true);
  });

  it("requires an explicit flag before processing", () => {
    const enabled = process.env.IG_AGENT_ENABLED === "true";
    expect(enabled).toBe(false);
  });
});
