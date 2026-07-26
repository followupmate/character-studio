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
