// RECOVERY video provider routing.
//
// Set by the operator 2026-09-04: Kling is the primary recovery video path, Seedance is secondary,
// and Veo is an explicit last-resort fallback — never a default. GOOGLE_API_KEY must therefore not
// be able to block a recovery generation.
//
// The earlier implementation hardcoded "veo" onto the recovery reel_video row, which was wrong on
// its own terms: it picked a provider because that provider happened to render exactly 8s. Provider
// choice is a routing decision; REEL_DURATION_GATE is an OUTPUT check on whatever comes back. The
// two are kept apart here deliberately.
//
// DURATIONS ARE VERIFIED, NOT ASSUMED. Every enum below is read out of the fal client's own
// generated types (node_modules/@fal-ai/client/src/types/endpoints.d.ts) or the provider's
// documented parameter, on 2026-09-04:
//
//   kling        KlingVideoV3ProImageToVideoInput.duration = "3".."15"          -> 8s exact
//   seedance-i2v Seedance2I2VInput.duration = "auto" | "4".."15"                -> 8s exact
//   veo          Veo 3.1 durationSeconds = 4 | 6 | 8                            -> 8s exact
//
// Note the earlier note in this repo that Kling accepts only "5"|"10" is true of v1.6/v2.1 — the
// path recovery uses is lib/klingProvider.ts, which is on v3 and takes whole seconds 3-15.

export const RECOVERY_VIDEO_PROVIDERS = ["kling", "seedance-i2v", "veo"] as const;
export type RecoveryVideoProvider = (typeof RECOVERY_VIDEO_PROVIDERS)[number];

/** The ordered recovery chain. Not configurable per-reel on purpose — one routing policy. */
export const RECOVERY_VIDEO_PROVIDER_CHAIN: RecoveryVideoProvider[] = ["kling", "seedance-i2v", "veo"];

export interface ProviderCapability {
  id: RecoveryVideoProvider;
  label: string;
  /** Whole-second durations this provider can actually render. */
  supportedDurationsSec: number[];
  /** Env var that must be present for this provider to run at all. */
  requiresEnv: "FAL_API_KEY" | "GOOGLE_API_KEY";
  /** Veo is opt-in: it is only ever reached as the last link of the chain, never as a default. */
  lastResortOnly: boolean;
}

export const RECOVERY_PROVIDER_CAPABILITY: Record<RecoveryVideoProvider, ProviderCapability> = {
  kling: {
    id: "kling",
    label: "Kling v3 pro image-to-video (fal.ai) — lib/klingProvider.ts",
    supportedDurationsSec: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    requiresEnv: "FAL_API_KEY",
    lastResortOnly: false,
  },
  "seedance-i2v": {
    id: "seedance-i2v",
    label: "Seedance 2.0 image-to-video (fal.ai/ByteDance)",
    supportedDurationsSec: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    requiresEnv: "FAL_API_KEY",
    lastResortOnly: false,
  },
  veo: {
    id: "veo",
    label: "Google Veo 3.1 Fast — explicit fallback only",
    supportedDurationsSec: [4, 6, 8],
    requiresEnv: "GOOGLE_API_KEY",
    lastResortOnly: true,
  },
};

export interface ResolvedDuration {
  provider: RecoveryVideoProvider;
  /** The duration this provider will actually be asked for. */
  durationSec: number;
  /** True when the provider can render the target exactly. */
  exact: boolean;
  /** Set when the provider cannot hit the target, naming the substitution. */
  note?: string;
}

/**
 * Translates the recovery target duration into what this provider can render.
 *
 * Nearest supported wins; ties go to the LONGER option, because a reel that runs slightly long can
 * still hold attention while one that runs short caps avg watch time outright (nine ~5.2s reels,
 * not one above 3.10s watch).
 */
export function resolveDurationForProvider(
  provider: RecoveryVideoProvider,
  targetSec: number
): ResolvedDuration {
  const supported = RECOVERY_PROVIDER_CAPABILITY[provider].supportedDurationsSec;
  let best = supported[0];
  for (const d of supported) {
    const better = Math.abs(d - targetSec) < Math.abs(best - targetSec);
    const tieButLonger = Math.abs(d - targetSec) === Math.abs(best - targetSec) && d > best;
    if (better || tieButLonger) best = d;
  }
  const exact = best === targetSec;
  return {
    provider,
    durationSec: best,
    exact,
    note: exact ? undefined : `${provider} cannot render ${targetSec}s; nearest supported is ${best}s`,
  };
}

export interface ProviderAttempt extends ResolvedDuration {
  available: boolean;
  /** Why this provider is not available, when it is not. */
  unavailableReason?: string;
}

/**
 * The full ordered plan: every provider in the chain with its translated duration and whether it
 * can run in this environment. Pure — the env is injected so it is testable.
 */
export function planRecoveryVideoProviders(
  targetSec: number,
  env: Partial<Record<"FAL_API_KEY" | "GOOGLE_API_KEY", string | undefined>>
): ProviderAttempt[] {
  return RECOVERY_VIDEO_PROVIDER_CHAIN.map((provider) => {
    const cap = RECOVERY_PROVIDER_CAPABILITY[provider];
    const key = env[cap.requiresEnv];
    const available = !!key && key.trim().length > 0;
    return {
      ...resolveDurationForProvider(provider, targetSec),
      available,
      unavailableReason: available ? undefined : `${cap.requiresEnv} is not set`,
    };
  });
}

/** The providers that will actually be attempted, in order. Empty means the slot must fail. */
export function attemptableProviders(plan: ProviderAttempt[]): ProviderAttempt[] {
  return plan.filter((p) => p.available);
}

/** Provenance recorded on the media row, so a result can always be traced to how it was routed. */
export interface ProviderProvenance {
  requested_provider: RecoveryVideoProvider | null;
  actual_provider: RecoveryVideoProvider | null;
  fallback_reason: string | null;
  requested_duration_sec: number;
  actual_duration_sec: number | null;
  chain: RecoveryVideoProvider[];
  attempts: Array<{ provider: RecoveryVideoProvider; durationSec: number; ok: boolean; error?: string }>;
}

/**
 * The message for a slot that has no video provider at all. Deliberately explicit about WHY per
 * provider — "no video provider" on its own sends someone hunting through three integrations.
 */
export function noProviderAvailableReason(plan: ProviderAttempt[]): string {
  const detail = plan.map((p) => `${p.provider}: ${p.unavailableReason ?? "unavailable"}`).join("; ");
  return `No video provider available for this recovery slot — ${detail}. A video slot is never rendered by an image generator.`;
}
