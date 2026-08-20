import { claudeWithRetry } from "@/lib/generatePrompts";
import type { PromptDirectorInput, VideoIntent } from "./types";

// Phase B — hybrid deterministic/LLM performance transformer (spec §22/§23).
//
// DETERMINISTIC (this file, no network): a curated lookup table covers the common abstract mood
// words the rest of the app already uses (situationPlanner / sexualEnergyConfig / playfulHotWorldConfig
// vocabularies — "playful", "sensual", "confident" etc.) and translates them into 1–3 concrete,
// observable behaviors. This is what compilePromptDirector() calls by default, so the deterministic
// compile path never depends on a live Claude call.
//
// LLM (refineAbstractTermWithClaude / generateAutoSpeech below): used only for (a) terms NOT in the
// table, and (b) auto-speech generation, which is inherently generative. Tests exercise only the
// pure prompt-construction functions (buildAutoSpeechPrompt) — same convention as
// lib/sceneBrief.test.ts / lib/slotPrompts.test.ts, which never mock claudeWithRetry either.

// Each entry: 1–3 concrete, observable behaviors — never more (spec §22: "Použiť iba 1–3
// relevantné prejavy, nie všetky naraz"). Vocabulary drawn from lib/sexualEnergyConfig.ts /
// lib/playfulHotWorldConfig.ts's existing mood/energy language so the map stays in sync with terms
// already flowing through the app, rather than inventing a parallel vocabulary.
const OBSERVABLE_BEHAVIOR_MAP: Record<string, string[]> = {
  confident: ["steady eye contact", "relaxed jaw", "small asymmetric half-smile"],
  playful: ["quick half-smile", "slight head tilt", "eyes crinkle briefly"],
  sensual: ["slow deliberate movement", "unhurried gaze", "soft exhale"],
  relaxed: ["loose shoulders", "unforced breathing", "slow blink"],
  mysterious: ["gaze held slightly off-lens", "minimal expression change", "unhurried movement"],
  joyful: ["genuine open smile", "eyes crinkle", "light forward lean"],
  serious: ["steady gaze", "neutral relaxed mouth", "still posture"],
  shy: ["brief glance away then back", "small closed-lip smile", "slightly lowered chin"],
  elegant: ["controlled unhurried movement", "long neck line held", "minimal gesture"],
  energetic: ["quicker natural movement", "bright open expression", "slight forward momentum"],
  curious: ["slight head tilt", "eyebrows lift briefly", "gaze tracks toward the subject"],
  nervous: ["quick glance away", "small swallow", "hands find something to hold"],
  warm: ["soft open smile", "gaze lingers a beat longer", "shoulders open toward camera"],
  bored: ["flat unhurried blink", "minimal expression", "gaze drifts slightly"],
  excited: ["quick genuine smile", "eyebrows lift", "slightly quicker breathing"],
  calm: ["slow steady breathing", "unforced stillness", "soft steady gaze"],
  flirty: ["brief held eye contact then look away", "small knowing smile", "slight chin dip"],
  seductive: ["slow unhurried gaze", "deliberate slow movement", "half-lidded eyes"],
  cheerful: ["open genuine smile", "bright eyes", "light energy in posture"],
  sultry: ["half-lidded gaze", "slow deliberate movement", "unhurried exhale"],
};

export interface ResolvedDescriptor {
  original: string;
  observableBehaviors: string[];
  source: "deterministic" | "unresolved";
}

// Matches a whole abstract-mood word inside free text (word boundary, case-insensitive) so
// "confident" inside "she looks confident" is caught without also matching "unconfident".
function findKnownTerm(text: string): { term: string; behaviors: string[] } | null {
  const lower = text.toLowerCase();
  for (const [term, behaviors] of Object.entries(OBSERVABLE_BEHAVIOR_MAP)) {
    if (new RegExp(`\\b${term}\\b`, "i").test(lower)) return { term, behaviors };
  }
  return null;
}

// Translates ONE free-text field (e.g. videoIntent.emotionalDelivery, or a bare mood word used as
// videoIntent.action) into concrete, observable behavior. Text that already reads as concrete
// action (e.g. "she shifts her weight onto one leg") passes through unchanged — this only rewrites
// recognized abstract mood vocabulary, per §22's rule that abstractions get grounded, not that
// every field gets rewritten.
export function resolvePerformanceDescriptor(text: string | undefined): ResolvedDescriptor | null {
  if (!text || !text.trim()) return null;
  const found = findKnownTerm(text);
  if (!found) return { original: text, observableBehaviors: [], source: "unresolved" };
  return { original: text, observableBehaviors: found.behaviors, source: "deterministic" };
}

// Applies resolvePerformanceDescriptor to the fields of a VideoIntent that are allowed to carry
// abstract mood language (emotionalDelivery is the primary target; action is only rewritten when
// it is ITSELF a bare mood word, e.g. action: "confident", not a real action sentence).
export function resolveVideoIntentPerformance(intent: VideoIntent): VideoIntent {
  const resolved: VideoIntent = { ...intent };

  if (intent.emotionalDelivery) {
    const match = resolvePerformanceDescriptor(intent.emotionalDelivery);
    if (match && match.observableBehaviors.length > 0) {
      resolved.emotionalDelivery = match.observableBehaviors.join(", ");
    }
  }

  // A bare single/double-word action (e.g. "confident", "feeling playful") is almost certainly an
  // abstract mood mislabeled as an action, not a concrete verb phrase — ground it. A longer,
  // already-concrete action sentence is left untouched.
  if (intent.action && intent.action.trim().split(/\s+/).length <= 3) {
    const match = resolvePerformanceDescriptor(intent.action);
    if (match && match.observableBehaviors.length > 0) {
      resolved.action = match.observableBehaviors.join(", ");
    }
  }

  return resolved;
}

// ── LLM fallback for unresolved abstract terms (Phase B, optional) ──────────────────────────
// Only called explicitly by a caller that wants network-backed refinement of a term NOT in the
// deterministic table above (compilePromptDirector() does not call this by default — see
// lib/promptDirector/compiler.ts). Kept separate so the deterministic compile path, and every test
// in this module, never touches the network.
export async function refineAbstractTermWithClaude(term: string): Promise<string[]> {
  const msg = await claudeWithRetry({
    model: "claude-sonnet-4-6",
    max_tokens: 80,
    system: `Translate one abstract mood/personality word into 1-3 concrete, observable physical behaviors a camera could actually see (facial expression, gaze, posture, small gesture). Output ONLY a comma-separated list, no other text, no the word itself.`,
    messages: [{ role: "user", content: term }],
  });
  const text = (msg.content[0] as { type: string; text: string }).text;
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
}

// ── AUTO speech (spec §16 AUTO mode) ─────────────────────────────────────────────────────────
// buildAutoSpeechPrompt is pure/exported so it's unit-testable without a network call — same
// convention as lib/sceneBrief.ts / lib/slotPrompts.ts, which test only the deterministic
// prompt-construction layer beneath claudeWithRetry.
export function buildAutoSpeechPrompt(input: PromptDirectorInput, durationSec: number | undefined): { system: string; maxTokens: number } {
  const sb = input.sceneBrief;
  const duration = durationSec ?? 6;
  // ~2.3 spoken words/sec is a conservative average pace — keeps the auto line short enough to
  // actually fit the shot instead of running over and getting cut mid-sentence by the video model.
  const maxWords = Math.max(4, Math.round(duration * 2.3));

  const system = `You write ONE short spoken line for a real person talking to camera in a short-form video. It must sound like natural spoken speech, never like a caption or a hashtag.

Scene: ${sb.spatial_setup}
Mood/light: ${sb.lighting_state}, ${sb.time_of_day}
${input.situationTranslation ? `Context: ${input.situationTranslation}\n` : ""}Character: ${input.character.visualBrief}

RULES:
- Maximum ${maxWords} words (the line must fit inside a ${duration}-second clip spoken at a natural pace).
- Conversational, first person, present tense.
- No hashtags, no emoji, no "like and subscribe", no caption-speak.
- No stage directions, no quotation marks in the output.
- Output ONLY the spoken line, nothing else.`;

  return { system, maxTokens: 60 };
}

export async function generateAutoSpeech(input: PromptDirectorInput, durationSec: number | undefined): Promise<string> {
  const { system, maxTokens } = buildAutoSpeechPrompt(input, durationSec);
  const msg = await claudeWithRetry({
    model: "claude-sonnet-4-6",
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: "Write the line now." }],
  });
  const text = (msg.content[0] as { type: string; text: string }).text;
  return text.trim().replace(/^["']|["']$/g, "");
}

// Resolves videoIntent.speech.text for every source (spec §16): "none" -> undefined, "manual" ->
// the user's text VERBATIM (never rewritten/shortened/expanded — hard rule), "auto" -> generated
// via generateAutoSpeech. Compiler calls this once per compile.
export async function resolveSpeechText(input: PromptDirectorInput, intent: VideoIntent | undefined): Promise<string | undefined> {
  const speech = intent?.speech;
  if (!speech || speech.source === "none") return undefined;
  if (speech.source === "manual") return speech.text;
  if (speech.source === "auto") return generateAutoSpeech(input, intent?.durationSec);
  return undefined;
}
