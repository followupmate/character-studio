import { describe, it, expect } from "vitest";
import { stripPromptHeader, sanitizePrompt } from "./promptClean";

describe("stripPromptHeader", () => {
  it("strips Soul image header with emoji and label", () => {
    expect(stripPromptHeader("Model: Soul 2 🖼️ Image Prompt: A woman in Paris"))
      .toBe("A woman in Paris");
  });

  it("strips Seedance video header", () => {
    expect(stripPromptHeader("Model: Seedance 2.0 🎬 Video Prompt: slow pan across the room"))
      .toBe("slow pan across the room");
  });

  it("strips a bare 'Image Prompt:' label", () => {
    expect(stripPromptHeader("Image Prompt: golden hour balcony")).toBe("golden hour balcony");
  });

  it("strips leading emoji/whitespace", () => {
    expect(stripPromptHeader("  🖤 morning coffee scene")).toBe("morning coffee scene");
  });

  it("leaves a clean prompt untouched", () => {
    expect(stripPromptHeader("A candid iPhone photo of a woman reading"))
      .toBe("A candid iPhone photo of a woman reading");
  });
});

describe("sanitizePrompt (Google safety rules)", () => {
  it("rewrites 'nude' as clothing color (the biggest IMAGE_SAFETY trigger)", () => {
    expect(sanitizePrompt("she wears a nude bodysuit")).toBe("she wears a sand-colored bodysuit");
  });

  it("walks the bikini chain down to neutral clothing", () => {
    const out = sanitizePrompt("triangle bikini top and high-cut bikini bottom");
    expect(out).not.toMatch(/bikini/i);
    expect(out).toMatch(/crop top/);
    expect(out).toMatch(/shorts/);
  });

  it("neutralizes anatomical 'bare' descriptors", () => {
    const out = sanitizePrompt("bare shoulders and bare legs in soft light");
    expect(out).not.toMatch(/\bbare\b/i);
  });

  it("strips Signature tags that would render as watermarks", () => {
    expect(sanitizePrompt("A quiet cafe scene. Signature: VIV-407.")).not.toMatch(/Signature/i);
  });

  it("keeps only the first block when Claude emits alternatives", () => {
    const out = sanitizePrompt("First scene here\n\nSecond alternative scene");
    expect(out).toContain("First scene");
    expect(out).not.toContain("Second alternative");
  });

  it("leaves safe prompts semantically intact", () => {
    expect(sanitizePrompt("A woman drinking espresso by a window"))
      .toBe("A woman drinking espresso by a window");
  });
});
