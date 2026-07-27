import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Production defect: every generated image/video prompt was cut off mid-word. The
// active "caption" doctrine capped output at 80 tokens (photo) / 100 (video), which
// the model hit every single time — photos landed at ~250-310 chars, videos ~320-410,
// none ending on a sentence, going back weeks. The truncated tail silently dropped
// lighting, background and any continuity lock that happened to be written last, and
// the row still saved as generation_status = "completed".
const src = readFileSync(new URL("./slotPrompts.ts", import.meta.url), "utf8");

function captionSpec(): string {
  const start = src.indexOf("  caption: {");
  expect(start).toBeGreaterThan(-1);
  return src.slice(start, src.indexOf("\n  },", start));
}

function tokensIn(spec: string, key: string): number {
  const m = spec.match(new RegExp(`${key}:\\s*(\\d+)`));
  expect(m, `${key} not found in caption doctrine`).not.toBeNull();
  return Number(m![1]);
}

describe("caption doctrine token budget", () => {
  const spec = captionSpec();

  it("gives a 20-45 word caption room to finish", () => {
    // 45 words + the "Model: Soul 2 🖼️ Image Prompt" prefix needs well over 80 tokens.
    expect(tokensIn(spec, "photoMaxTokens")).toBeGreaterThanOrEqual(150);
    expect(tokensIn(spec, "videoMaxTokens")).toBeGreaterThanOrEqual(150);
  });

  it("keeps the video budget at least as large as the photo one", () => {
    expect(tokensIn(spec, "videoMaxTokens")).toBeGreaterThanOrEqual(tokensIn(spec, "photoMaxTokens"));
  });

  it("never returns to the caps that truncated every prompt", () => {
    expect(tokensIn(spec, "photoMaxTokens")).not.toBe(80);
    expect(tokensIn(spec, "videoMaxTokens")).not.toBe(100);
  });
});

// The active doctrine is "caption", which composes its system prompt from captionBody()
// — a compact block that carries neither visual_rules nor the wardrobe/animal lock block
// used by the other doctrines. #133 added the animal lock to commonBody() only, so on a
// pets_spontaneous day the locked cat never reached the prompt and vanished from all
// three slots, even though the brief described it and visual_rules said "cat stays on
// counter throughout".
describe("animal lock reaches the active caption path", () => {
  const captionBody = src.slice(src.indexOf("function captionBody"), src.indexOf("function buildPhotoSystem"));

  it("captionBody injects pet_lock", () => {
    expect(captionBody).toContain("sceneBriefJson.pet_lock");
    expect(captionBody).toMatch(/ANIMAL \(the SAME individual/);
  });

  it("actually interpolates the animal line into the returned prompt body", () => {
    // Declaring the constant is not enough — it has to reach the template literal.
    const returned = captionBody.slice(captionBody.indexOf("return `"));
    expect(returned).toContain("${animalLine}");
  });

  it("keeps the identity constraint, not just the animal's presence", () => {
    expect(captionBody).toMatch(/never a different breed, coat, colour or count/i);
  });

  it("demands the species noun, not a breed-only caption", () => {
    // Production: the caption said "blue-grey British Shorthair" with no species word
    // and the generator drew a dog on a cat day. Breed names alone are unreliable.
    expect(captionBody).toMatch(/ANIMAL WORDING/);
    expect(captionBody).toMatch(/always write the SPECIES noun/i);
    expect(captionBody).toMatch(/British Shorthair cat/);
  });

  it("stays absent when the day has no animal", () => {
    // guarded by the pet_lock ternary — no stray "ANIMAL:" line on petless days
    expect(captionBody).toMatch(/pet_lock\s*\?[\s\S]*?:\s*""/);
  });

  it("the other doctrines keep their own animal lock line", () => {
    const commonBody = src.slice(src.indexOf("function commonBody"), src.indexOf("function captionBody"));
    expect(commonBody).toContain("sceneBriefJson.pet_lock");
  });
});

describe("truncation is reported", () => {
  it("logs loudly when a prompt hits the token ceiling", () => {
    expect(src).toContain('stop_reason === "max_tokens"');
    expect(src).toMatch(/TRUNCATED at max_tokens/);
    // the message must name the slot and the knob to turn
    expect(src).toMatch(/slot=\$\{args\.slot\.slot\}/);
    const logLine = src.slice(src.indexOf("TRUNCATED at max_tokens"));
    expect(logLine).toContain("videoMaxTokens");
    expect(logLine).toContain("photoMaxTokens");
  });
});
