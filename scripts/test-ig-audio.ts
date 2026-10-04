/**
 * READ-ONLY check of the Instagram Audio API (Facebook Login). Lists trending audio. Publishes nothing,
 * writes nothing, prints no token.
 *
 *   FB_IG_USER_ID=17841420035272321 FB_TEST_USER_TOKEN=... npx tsx scripts/test-ig-audio.ts
 *   npx tsx scripts/test-ig-audio.ts --search=chill --limit=10
 *   npx tsx scripts/test-ig-audio.ts --original          # trending original sounds
 *   npx tsx scripts/test-ig-audio.ts --duration=12       # simulate pickAudio() for a 12 s reel
 *
 * Token order: FB_PAGE_ACCESS_TOKEN, FB_LONG_LIVED_USER_TOKEN, FB_TEST_USER_TOKEN.
 * A user token is turned into the page token via me/accounts (the same code path as production).
 * No `@/` aliases and no Supabase on purpose, so it runs with plain tsx.
 */
import { resolveFbPageToken, errMessage } from "../lib/fbToken";
import { fetchIgAudio, pickAudio, buildAudioConfiguration } from "../lib/igAudio";

function arg(name: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : undefined;
}

async function main() {
  const igUserId = process.env.FB_IG_USER_ID?.trim() || "17841420035272321";
  const env = { ...process.env } as Record<string, string | undefined>;
  if (!env.FB_PAGE_ACCESS_TOKEN && !env.FB_LONG_LIVED_USER_TOKEN && env.FB_TEST_USER_TOKEN) {
    env.FB_LONG_LIVED_USER_TOKEN = env.FB_TEST_USER_TOKEN; // test user token goes through the same me/accounts derivation
  }
  env.FB_IG_USER_ID = igUserId;

  const page = await resolveFbPageToken({ env });
  if (!page) {
    console.error("No usable token: set FB_PAGE_ACCESS_TOKEN, FB_LONG_LIVED_USER_TOKEN or FB_TEST_USER_TOKEN (and FB_IG_USER_ID).");
    process.exit(2);
  }
  console.log(`token source: ${page.source} | ig_user_id: ${igUserId}`);

  const original = process.argv.includes("--original");
  const search = arg("search");
  const limit = Number(arg("limit") ?? 25);
  const items = await fetchIgAudio({
    igUserId,
    token: page.token,
    audioType: original ? "original_sound" : "music",
    searchQuery: search,
    pageSize: Math.min(Math.max(limit, 1), 25),
    maxPages: limit > 25 ? 2 : 1,
  });

  console.log(`${original ? "original_sound" : "music"}${search ? ` search="${search}"` : " (trending)"}: ${items.length} items`);
  for (const it of items.slice(0, limit)) {
    const dur = it.duration_in_ms ? `${(it.duration_in_ms / 1000).toFixed(0)}s` : "?";
    console.log(
      [it.audio_id, dur.padStart(5), `ads_eligible=${String(it.is_ads_eligible ?? "n/a").padEnd(5)}`, `${it.display_artist ?? it.ig_username ?? "?"} — ${it.title ?? "?"}`].join(" | ")
    );
  }
  const eligible = items.filter((i) => i.is_ads_eligible === true).length;
  console.log(`ads-eligible: ${eligible}/${items.length}`);

  const sec = Number(arg("duration"));
  if (sec > 0) {
    const pick = pickAudio({ candidates: items, videoDurationMs: sec * 1000 });
    console.log(pick ? `pickAudio(${sec}s) -> ${pick.item.audio_id} [${pick.tier}] audio_configuration=${buildAudioConfiguration(pick.item.audio_id)}` : "pickAudio -> none");
  }
}

main().catch((e) => {
  console.error("FAILED:", errMessage(e));
  process.exit(1);
});
