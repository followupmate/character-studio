// The one place that answers "is this slot part of a prepared reel experiment, and how should it
// be generated?"
//
// The generation route used to read `visual_signature.recovery` directly. That key is what routes
// a video slot through the Kling -> Seedance -> Veo chain instead of the ad-hoc if/else, and what
// hands Soul V2 the framing negatives it has no crop parameter for. A second experiment written
// under its own key would have silently lost both: the video slot would have fallen back to the
// generic path — which is exactly how a reel_video slot once produced a .jpg — and the start frame
// would have come back full-body with a small face.
//
// So the routing question is asked once, here, and both markers answer it.

export type ReelExperimentKind = "recovery" | "visual_hook";

export interface ReelExperimentRouting {
  kind: ReelExperimentKind;
  /** 1-based index within its own experiment, when the marker carries one. */
  index: number | null;
  /** What the video slot asks the provider for. The duration GATE is a separate output check and
   *  never influences which provider is chosen. */
  targetDurationSec: number | null;
  /** Appended to the base image negatives for the start frame. */
  negativePrompt: string | null;
}

interface RecoveryMarkerShape {
  recovery_sprint?: boolean;
  recovery_index?: number;
  slot?: number;
  target_duration_sec?: number;
  negative_prompt?: string;
}

interface VhdMarkerShape {
  index?: number;
  target_duration_sec?: number;
  negative_prompt?: string;
}

export interface ExperimentBearingSignature {
  recovery?: RecoveryMarkerShape | null;
  visual_hook_experiment?: VhdMarkerShape | null;
}

const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/**
 * Returns the routing for a prepared experiment slot, or null for an ordinary one.
 *
 * Recovery wins when both markers are somehow present: a recovery asset is already rendered and
 * approved by eye, and nothing later should change how it regenerates.
 */
export function readReelExperiment(
  signature: ExperimentBearingSignature | null | undefined
): ReelExperimentRouting | null {
  const rec = signature?.recovery;
  if (rec) {
    return {
      kind: "recovery",
      index: numOrNull(rec.recovery_index) ?? numOrNull(rec.slot),
      targetDurationSec: numOrNull(rec.target_duration_sec),
      negativePrompt: strOrNull(rec.negative_prompt),
    };
  }
  const vhd = signature?.visual_hook_experiment;
  if (vhd) {
    return {
      kind: "visual_hook",
      index: numOrNull(vhd.index),
      targetDurationSec: numOrNull(vhd.target_duration_sec),
      negativePrompt: strOrNull(vhd.negative_prompt),
    };
  }
  return null;
}
