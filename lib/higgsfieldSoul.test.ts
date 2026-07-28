import { describe, it, expect } from "vitest";
import { classifyHiggsfieldFailure } from "./higgsfieldSoul";

// generateSoulImage() itself is network-bound and not unit tested (house convention) —
// classifyHiggsfieldFailure() is the pure half, extracted specifically to be testable without
// hitting the Higgsfield API.
describe("classifyHiggsfieldFailure", () => {
  it("classifies a 401 submit status as invalid_credential", () => {
    expect(classifyHiggsfieldFailure(401)).toBe("invalid_credential");
  });

  it("classifies a 403 submit status as invalid_credential", () => {
    expect(classifyHiggsfieldFailure(403)).toBe("invalid_credential");
  });

  it("classifies a job status of 'nsfw' as nsfw", () => {
    expect(classifyHiggsfieldFailure(undefined, "nsfw")).toBe("nsfw");
  });

  it("classifies any other submit status as other", () => {
    expect(classifyHiggsfieldFailure(500)).toBe("other");
    expect(classifyHiggsfieldFailure(422)).toBe("other");
  });

  it("classifies no inputs at all as other", () => {
    expect(classifyHiggsfieldFailure()).toBe("other");
  });

  it("401/403 takes precedence over an nsfw job status if somehow both are present", () => {
    expect(classifyHiggsfieldFailure(401, "nsfw")).toBe("invalid_credential");
  });
});
