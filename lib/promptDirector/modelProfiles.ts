import type { PromptDirectorOutputType, PromptDirectorTargetModel, PromptPackageSectionKey, PromptPackageSections } from "./types";
import { MODEL_CAPABILITIES } from "./constants";

// Model profile compilers (spec §20) — same structured PromptPackageSections in, different final
// prompt STRING out per provider. This is the "AKO to modelu povieme" layer: it never adds new
// facts, it only selects which sections a given provider actually consumes, in what order, and how
// verbosely, based on that provider's real capability (lib/promptDirector/constants.ts
// MODEL_CAPABILITIES) — e.g. a model with supportsAudio:false never gets an audio block, no matter
// what's in sections.audio.

interface ModelProfileSpec {
  header: (outputType: PromptDirectorOutputType) => string;
  sectionOrder: PromptPackageSectionKey[];
  // "concise" joins section lines into fewer, denser sentences (Kling/Wan reward a tight prompt
  // since the source image already carries identity/scene/light); "full" keeps one line per fact.
  verbosity: "concise" | "full";
}

const MODEL_PROFILES: Record<PromptDirectorTargetModel, ModelProfileSpec> = {
  soul2: {
    header: () => "Model: Soul 2 \u{1F5BC}️ Image Prompt",
    // Higgsfield Soul 2.0 guidance: short, focused prompts with the most important visual info
    // first, and no restating identity/wardrobe-policy facts the Soul ID reference already
    // carries. Order = shot -> pose/action -> scene -> lighting -> aesthetic -> realism cues.
    // `identity`, `reference`, `appearance`, and `imperfections` stay populated in `sections` for
    // callers/tests, but their content is folded into `pose`/`scene`/`realism` above rather than
    // rendered as their own blocks — see lib/promptDirector/imageSections.ts.
    sectionOrder: ["camera", "pose", "scene", "lighting", "aesthetic", "realism"],
    verbosity: "full",
  },
  kling: {
    header: () => "Model: Kling \u{1F3AC} Video Prompt",
    // Every real Kling call in this repo is image-to-video (lib/klingProvider.ts) — the source
    // frame already carries identity/scene/wardrobe/lighting, so scene/lighting/appearance are
    // deliberately excluded here (matches lib/seedancePromptCompiler.ts's documented finding that
    // restating them wastes budget and can compete with the image for what actually renders).
    sectionOrder: ["reference", "identity", "camera", "humanMovement", "environmentMovement", "stability"],
    verbosity: "concise",
  },
  higgsfield: {
    header: () => "Model: Higgsfield \u{1F3AC} Video Prompt",
    sectionOrder: ["identity", "scene", "camera", "expression", "humanMovement", "stability"],
    verbosity: "full",
  },
  seedance: {
    header: () => "Model: Seedance 2.0 \u{1F3AC} Video Prompt",
    sectionOrder: ["reference", "identity", "scene", "camera", "humanMovement", "environmentMovement", "timeline", "speech", "lipSync", "audio", "stability"],
    verbosity: "full",
  },
  wan: {
    header: () => "Model: Wan \u{1F3AC} Video Prompt",
    // Restrained by design (spec §20: "avoid verbose redundant scene description") — reference +
    // identity + ONE action/camera line + stability only.
    sectionOrder: ["reference", "identity", "humanMovement", "camera", "stability"],
    verbosity: "concise",
  },
  veo: {
    header: () => "Model: Veo \u{1F3AC} Video Prompt",
    // generateWithVeo always sources the reel_start_frame as the i2v anchor when one exists (see
    // constants.ts's veo capability comment), so scene/lighting/appearance are redundant here —
    // same reasoning as Kling. "full" verbosity (not "concise") because the EXACT SPOKEN LINE
    // instruction in the speech section needs to stand out as its own labeled block, not get
    // folded into a comma-joined run where a quoted line could be misread as scene description.
    sectionOrder: ["reference", "identity", "camera", "humanMovement", "environmentMovement", "speech", "audio", "stability"],
    verbosity: "full",
  },
};

const SECTION_LABEL: Partial<Record<PromptPackageSectionKey, string>> = {
  videoSpecs: "Video specs",
  humanMovement: "Movement",
  environmentMovement: "Environment motion",
  lipSync: "Lipsync",
};

function sectionToConcise(lines: string[]): string {
  return lines.join(", ").replace(/\.\s*,/g, ",").replace(/,\s*$/, ".");
}

// F0.3 — sectionToFull: ensure each line ends with punctuation, join with spaces, avoid fragment runs
function sectionToFull(key: PromptPackageSectionKey, lines: string[]): string {
  const label = SECTION_LABEL[key];
  // Ensure each line ends with punctuation
  const punctuatedLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return "";
    return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
  }).filter(Boolean);
  const joined = punctuatedLines.join(" ");
  return label ? `${label}: ${joined}` : joined;
}

export function compilePositivePrompt(
  sections: PromptPackageSections,
  targetModel: PromptDirectorTargetModel,
  outputType: PromptDirectorOutputType
): string {
  const profile = MODEL_PROFILES[targetModel];
  const capability = MODEL_CAPABILITIES[targetModel];

  const blocks: string[] = [profile.header(outputType)];

  for (const key of profile.sectionOrder) {
    // Capability-gate speech/lipSync/audio/videoSpecs even if the section builder produced
    // content for them — a model without native audio/speech never gets those lines, regardless
    // of what the caller assembled (this is the one place capability enforcement is mandatory,
    // not advisory — see spec §20's "Nevymýšľaj podporu audio/speech tam, kde ju integrácia nemá").
    if ((key === "speech" || key === "lipSync") && !capability.supportsSpeech) continue;
    if (key === "audio" && !capability.supportsAudio) continue;

    const lines = sections[key];
    if (!lines || lines.length === 0) continue;

    blocks.push(profile.verbosity === "concise" ? sectionToConcise(lines) : sectionToFull(key, lines));
  }

  return blocks.filter(Boolean).join("\n\n");
}

export function compileNegativePrompt(negatives: string[] | undefined): string | undefined {
  if (!negatives || negatives.length === 0) return undefined;
  return negatives.join(", ");
}

export { MODEL_PROFILES };
