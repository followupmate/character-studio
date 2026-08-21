// F2 — LLM Prompt Writer (lib/promptDirector/promptWriter.ts)
// Takes structured facts (camera, pose, scene, lighting) and rewrites them as one continuous
// editorial brief (60–110 words), reducing fragment noise while preserving visual specificity.
// Uses Claude Sonnet 4.6 for quality; falls back to deterministic F0 compiler on any validation failure.

import { claudeWithRetry } from "@/lib/generatePrompts";
import { assertNoSoul2MetaLeakage } from "./imageSections";

const EDITORIAL_GUIDE = `Write like an editorial fashion photography brief:
- One continuous scene, one subject, present tense
- Concrete nouns; materials and light named precisely
- 60–110 words; no lists, no meta language
- End with one mood clause (optional)
- No camera brand talk beyond one lens/exposure cue`;

// Pure validation function — testable, no I/O
export function validateWrittenPrompt(
  prompt: string,
  wardrobeLock?: string,
  spatialSetup?: string
): string[] {
  const errors: string[] = [];
  const words = prompt.trim().split(/\s+/).filter(Boolean);

  // Word count
  if (words.length < 40 || words.length > 130) {
    errors.push(`Word count ${words.length} outside 40–130 range`);
  }

  // Must contain wardrobe anchor if provided
  if (wardrobeLock) {
    // Extract first key noun from wardrobe (e.g. "swimsuit" from "white matte-stretch swimsuit")
    const wardrobeMatch = wardrobeLock.match(/\b(swimsuit|dress|shirt|pants|jacket|skirt|suit|robe|garment|outfit|shirt|blouse|trousers|shorts)\b/i);
    if (wardrobeMatch && !prompt.toLowerCase().includes(wardrobeMatch[1].toLowerCase())) {
      errors.push(`Missing wardrobe anchor: "${wardrobeMatch[1]}"`);
    }
  }

  // Must contain environment anchor if provided
  if (spatialSetup) {
    const envMatch = spatialSetup.match(/\b(terrace|pool|beach|room|studio|café|cafe|garden|balcony|window|courtyard|plaza|market)\b/i);
    if (envMatch && !prompt.toLowerCase().includes(envMatch[1].toLowerCase())) {
      errors.push(`Missing environment anchor: "${envMatch[1]}"`);
    }
  }

  // Forbidden meta-leakage (overlap with assertNoSoul2MetaLeakage)
  const forbidden = ["soul", "kling", "seedance", "text overlay", "video", "image-to-video", "workflow"];
  const lower = prompt.toLowerCase();
  for (const term of forbidden) {
    if (lower.includes(term)) errors.push(`Meta-leakage: "${term}"`);
  }

  // Markdown or lists
  if (prompt.includes("- ") || prompt.includes("* ")) {
    errors.push("Contains list syntax");
  }

  return errors;
}

// Main entry point — calls Claude, validates, retries ONCE with the validation errors fed back,
// then falls back to the deterministic F0 prompt. Never throws — a writer problem can never take
// down slot generation (contract required by lib/dailyBatch.ts's generateSlotPromptViaDirector).
export async function writeSoul2Prompt(
  positiveFactsBlock: string,
  wardrobeLock: string,
  spatialSetup: string,
  fallbackPrompt: string
): Promise<string> {
  const systemPrompt = `You are rewriting structured visual facts into a single, cohesive editorial photography brief.

${EDITORIAL_GUIDE}

ANTI-INVENTION: you may reword and reorder the facts, but you CANNOT invent:
- new garments or wardrobe not in the lock
- new locations or props not in the spatial setup
- new people or a different subject`;

  let retryNote = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const userPrompt = `Rewrite these facts as ONE continuous editorial brief:

---
${positiveFactsBlock}
---

Wardrobe lock: ${wardrobeLock}
Spatial setup: ${spatialSetup}
${retryNote ? `\nYOUR PREVIOUS ATTEMPT WAS REJECTED — fix these specific problems: ${retryNote}\n` : ""}
Output: the prompt only (no preamble, no explanation).`;

      const res = await claudeWithRetry({
        model: "claude-sonnet-4-6",
        max_tokens: 300,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });

      const generated = ((res.content?.[0] as { type?: string; text?: string } | undefined)?.type === "text"
        ? (res.content[0] as { text: string }).text
        : ""
      ).trim();
      if (!generated) throw new Error("Claude returned empty");

      const errors = validateWrittenPrompt(generated, wardrobeLock, spatialSetup);
      try {
        assertNoSoul2MetaLeakage(generated);
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }

      if (errors.length === 0) return generated;

      retryNote = errors.join("; ");
      console.warn(`[promptWriter] Validation failed (attempt ${attempt + 1}/2): ${retryNote}`);
    } catch (err) {
      console.warn(`[promptWriter] Claude call failed (attempt ${attempt + 1}/2):`, err instanceof Error ? err.message : err);
    }
  }

  console.warn("[promptWriter] All attempts failed — using deterministic F0 fallback prompt.");
  return fallbackPrompt;
}
