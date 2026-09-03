import { claudeWithRetry } from "@/lib/generatePrompts";
import type { SceneSemanticsSource } from "@/lib/sceneSemantics";
import type { SemanticViolation, SemanticViolationType } from "./semanticValidator";

// RECOVERY phase 3 — LAYER 2: the LLM semantic judge.
//
// Prop and action coherence cannot be caught lexically in the general case. "glass tilts, liquid
// follows gravity, liquid level changes, natural swallow" is a complete description of drinking
// from a cup that contains no word layer 1 could key on except the handful in
// MANIPULABLE_OBJECTS. This pass reads the scene brief and the final motion prompt together and
// answers one question: does this prompt describe something that could happen in this scene?
//
// Failure posture matters as much as the check: a `fail` verdict is an ERROR and blocks
// generation, but a timeout, an API error or an unparseable response is a WARNING and lets the
// pipeline through. We are not trading a broken prompt layer for a pipeline that stops whenever
// Anthropic has a bad minute.

const JUDGE_MODEL = "claude-haiku-4-5-20251001";
const JUDGE_TIMEOUT_MS = 20_000;

export interface JudgeVerdict {
  verdict: "pass" | "fail";
  violations: Array<{ type: SemanticViolationType; detail: string }>;
}

export interface JudgeInput {
  brief: SceneSemanticsSource & { location_constraints?: string[] | null };
  prompt: string;
  sceneLocation?: string | null;
}

const SYSTEM = `You are a strict consistency checker for AI video prompts. You are given a SCENE (the locked description of a place, a wardrobe and the objects that exist there) and a MOTION PROMPT (what the video generator is told to animate).

Decide whether the motion prompt describes something that could actually happen in that scene.

Check exactly three things:
1. PROPS — every physical object the prompt has the subject touch, hold, lift, tilt, drink from, open or otherwise manipulate must exist in the scene. An object merely SITTING in the scene untouched is fine and is not a violation. An object the prompt has her handle that the scene never mentions IS a violation.
2. LOCOMOTION — the prompt may only describe the subject walking, striding or moving through space if the scene's own description places her in a position and a place where that is possible. A woman seated in a car, lying on a bed or reclined on a sunbed is not walking.
3. OVERALL COHERENCE — the prompt must not contradict the scene's location, surfaces, light or physical layout.

Do NOT flag: stylistic choices, wardrobe detail, camera language, emotional direction, pacing, whether the prompt is good, or anything you merely dislike. Only physical impossibility and object invention.

Respond with STRICT JSON and nothing else. No preamble, no markdown fence, no explanation outside the JSON:
{"verdict":"pass","violations":[]}
or
{"verdict":"fail","violations":[{"type":"prop","detail":"..."}]}

"type" must be one of: prop, action, format, audio.`;

const VALID_TYPES: ReadonlySet<string> = new Set<SemanticViolationType>(["prop", "action", "format", "audio"]);

// Strict: the contract says JSON only. We still tolerate a surrounding fence, because refusing a
// correct verdict over a stray ``` would turn a working check into a warning for no reason — but
// anything that is not parseable JSON with a valid verdict is treated as a judge failure, never as
// a pass.
export function parseJudgeResponse(raw: string): JudgeVerdict | null {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first < 0 || last <= first) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned.slice(first, last + 1));
  } catch {
    return null;
  }
  const obj = parsed as { verdict?: unknown; violations?: unknown };
  if (obj.verdict !== "pass" && obj.verdict !== "fail") return null;
  const violations = Array.isArray(obj.violations) ? obj.violations : [];
  const normalized = violations
    .map((v) => v as { type?: unknown; detail?: unknown })
    .filter((v) => typeof v.detail === "string" && v.detail.trim().length > 0)
    .map((v) => ({
      type: (typeof v.type === "string" && VALID_TYPES.has(v.type) ? v.type : "action") as SemanticViolationType,
      detail: String(v.detail).trim(),
    }));
  // A "fail" with no usable violation is not actionable — treat it as an unparseable response
  // rather than blocking generation with an empty reason.
  if (obj.verdict === "fail" && normalized.length === 0) return null;
  return { verdict: obj.verdict, violations: normalized };
}

export function buildJudgeUserMessage(input: JudgeInput): string {
  const b = input.brief;
  return [
    "SCENE",
    input.sceneLocation ? `Location: ${input.sceneLocation}` : null,
    b.spatial_setup ? `Spatial setup: ${b.spatial_setup}` : null,
    b.location_constraints?.length ? `Location constraints: ${b.location_constraints.join("; ")}` : null,
    `Objects present (the ONLY objects that exist here): ${
      (b.allowed_props ?? []).length > 0 ? (b.allowed_props ?? []).join("; ") : "none"
    }`,
    b.wardrobe_lock ? `Wardrobe (worn, not props): ${b.wardrobe_lock}` : null,
    "",
    "MOTION PROMPT",
    input.prompt,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

export interface JudgeResult {
  violations: SemanticViolation[];
  /** true when the judge actually returned a usable verdict; false when it timed out or errored. */
  ran: boolean;
  error?: string;
}

export async function judgeSceneCoherence(input: JudgeInput): Promise<JudgeResult> {
  try {
    const msg = await Promise.race([
      claudeWithRetry({
        model: JUDGE_MODEL,
        max_tokens: 600,
        system: SYSTEM,
        messages: [{ role: "user", content: buildJudgeUserMessage(input) }],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`semantic judge timed out after ${JUDGE_TIMEOUT_MS}ms`)), JUDGE_TIMEOUT_MS)
      ),
    ]);

    const raw = (msg.content[0] as { type: string; text: string })?.text ?? "";
    const parsed = parseJudgeResponse(raw);
    if (!parsed) {
      return {
        ran: false,
        error: `unparseable judge response: ${raw.slice(0, 200)}`,
        violations: [
          {
            type: "action",
            severity: "warning",
            rule: "semantic_judge_unavailable",
            detail: `layer 2 returned an unusable response — generation not blocked. Raw: ${raw.slice(0, 200)}`,
          },
        ],
      };
    }

    return {
      ran: true,
      violations: parsed.violations.map((v) => ({
        type: v.type,
        severity: "error" as const,
        rule: "semantic_judge",
        detail: v.detail,
      })),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Deliberately non-blocking: an Anthropic outage must not stop the content pipeline.
    return {
      ran: false,
      error: message,
      violations: [
        {
          type: "action",
          severity: "warning",
          rule: "semantic_judge_unavailable",
          detail: `layer 2 did not run (${message}) — generation not blocked`,
        },
      ],
    };
  }
}
