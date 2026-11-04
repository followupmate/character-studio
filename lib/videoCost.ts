// Cost guards for paid fal video calls (2026-11-04 cost audit).
//
// 1) Kling v3 bills per second ($0.112/s audio off). Every reel target is 8 s
//    (REEL_DURATION_GATE 6.5–8.5 s), so nothing may ask Kling for more than 8 s.
// 2) A content-policy refusal is deterministic for that prompt + start frame. Retrying it
//    blindly (reconcile cron) only burns money, so a refusal is terminal: it exhausts retries.

export const KLING_MAX_DURATION_SEC = 8;

export function capKlingDuration(sec: number | null | undefined, fallback = KLING_MAX_DURATION_SEC): number {
  const n = Math.round(typeof sec === "number" && Number.isFinite(sec) ? sec : fallback);
  return Math.min(KLING_MAX_DURATION_SEC, Math.max(3, n));
}

const REFUSAL_RE = /content[_ -]?policy|likenesses of real people|partner_validation_failed|zamietol tento/i;

export function isContentPolicyRefusal(text: string | null | undefined): boolean {
  return !!text && REFUSAL_RE.test(text);
}

/** Human label naming the provider that actually refused (derived from the fal model id). */
export function providerLabel(falModel: string | null | undefined): string {
  const m = (falModel ?? "").toLowerCase();
  if (m.includes("kling")) return "Kling";
  if (m.includes("seedance") || m.includes("bytedance")) return "Seedance";
  if (m.includes("veo")) return "Veo";
  if (m.includes("mmaudio")) return "MMAudio";
  return falModel || "Video model";
}

export function refusalMessage(falModel: string | null | undefined): string {
  return `${providerLabel(falModel)} zamietol tento konkrétny záber (content policy). Automaticky sa to už neopakuje — uprav prompt alebo štartovací záber a spusti ručne.`;
}
