import { supabase } from "@/lib/supabase";
import Sidebar from "@/components/dashboard/Sidebar";
import FanvueClient from "./FanvueClient";
import { isFlagOn } from "@/lib/featureFlags";
import { deriveStrategy, FanvueSnapshot } from "@/lib/fanvueStrategy";
import { extractSituation } from "@/lib/situationPlanner";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getData() {
  const [{ data: drafts }, { data: characters }] = await Promise.all([
    supabase
      .from("chs_fanvue_unlocks")
      .select("id, character_id, series_name, title, teaser_text, sales_copy, suggested_price, intensity, ig_cta, fanvue_prompt, unlock_type, status, story_day_id, created_at, media_urls, published_at, publish_error, pipeline_version, content_level, continuation_plan")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("chs_characters").select("id, name, feature_flags, fanvue_snapshot, fanvue_link, adult_content_verified").eq("is_active", true),
  ]);

  const dayIds = Array.from(new Set((drafts ?? []).map((d) => d.story_day_id).filter(Boolean))) as string[];
  const [{ data: days }, { data: dayMedia }] = dayIds.length
    ? await Promise.all([
        // scene — item 3: read-only source for fanvue_tension, so the UI can show it as its own
        // labelled field instead of only indirectly inside interpolated prompt/paid_promise text.
        supabase.from("chs_story_days").select("id, date, tier, location, hook_text, ig_caption, scene").in("id", dayIds),
        supabase.from("chs_media").select("story_day_id, thumbnail_url, media_url, status").in("story_day_id", dayIds).not("media_url", "is", null),
      ])
    : [{ data: [] }, { data: [] }];
  const dayById = new Map(
    (days ?? []).map((d) => {
      const fanvue_tension = extractSituation(d)?.fanvue_tension ?? null;
      return [d.id, { id: d.id, date: d.date, tier: d.tier, location: d.location, hook_text: d.hook_text, ig_caption: d.ig_caption, fanvue_tension }];
    })
  );
  // First available IG media per source day — "Instagram source and thumbnail" in the v1 card.
  // Prefers a posted/ready item, otherwise whatever came back first.
  const thumbByDay = new Map<string, string>();
  for (const m of dayMedia ?? []) {
    const day = m.story_day_id as string;
    const url = (m.thumbnail_url as string | null) ?? (m.media_url as string | null);
    if (!url) continue;
    if (!thumbByDay.has(day) || m.status === "posted" || m.status === "ready") thumbByDay.set(day, url);
  }

  // Read-only MCP audit panel (gated by mcp_audit flag) — show the agent-audited Fanvue snapshot + strategy.
  const auditChar = (characters ?? []).find((c) => isFlagOn(c.feature_flags, "mcp_audit") && c.fanvue_snapshot);
  const snapshot = (auditChar?.fanvue_snapshot ?? null) as FanvueSnapshot | null;
  const strategy = deriveStrategy(snapshot);

  const funnelChars = (characters ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    fanvue_link: ((c as Record<string, unknown>).fanvue_link as string | null) ?? null,
    adult_content_verified: ((c as Record<string, unknown>).adult_content_verified as boolean | null) ?? false,
  }));

  return {
    drafts: drafts ?? [],
    dayById: Object.fromEntries(dayById),
    thumbByDay: Object.fromEntries(thumbByDay),
    snapshot,
    strategy,
    auditName: auditChar?.name ?? null,
    funnelChars,
  };
}

export default async function FanvuePage() {
  const { drafts, dayById, thumbByDay, snapshot, strategy, auditName, funnelChars } = await getData();
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 lg:ml-56">
        <div className="sticky top-0 z-40 bg-surface border-b border-border pl-14 pr-4 lg:px-8 h-13 flex items-center justify-between">
          <h1 className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted2">Fanvue · Unlock Drafts</h1>
          <span className="font-mono text-[10px] text-muted">publish len na explicitný klik</span>
        </div>

        {snapshot && strategy && (
          <div className="p-4 lg:px-8 lg:pt-6">
            <div className="bg-[#050709] border border-border p-4">
              <div className="flex items-center justify-between">
                <div className="font-mono text-[11px] text-ink uppercase tracking-[0.05em]">
                  Fanvue audit · @{snapshot.handle} {auditName ? `(${auditName})` : ""}
                </div>
                <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-teal border border-teal/30 bg-teal/10 px-2 py-0.5">read-only · MCP</span>
              </div>
              <div className="flex flex-wrap gap-2 mt-3 font-mono text-[9px] text-muted">
                <span className="border border-border px-1.5 py-0.5">followers {snapshot.followers ?? 0}</span>
                <span className="border border-border px-1.5 py-0.5">subscribers {snapshot.subscribers ?? 0}</span>
                <span className="border border-border px-1.5 py-0.5">earnings ${Number(snapshot.earnings_total ?? 0).toFixed(2)}</span>
                <span className="border border-border px-1.5 py-0.5">posts {snapshot.post_count ?? 0}</span>
                <span className="border border-border px-1.5 py-0.5">PPV {snapshot.ppv_post_count ?? 0}</span>
                {snapshot.audited_at && <span className="border border-border px-1.5 py-0.5">audited {snapshot.audited_at.slice(0, 10)}</span>}
              </div>
              <div className="mt-3 font-mono text-[10px] text-amber">{strategy.headline}</div>
              <ul className="mt-2 font-mono text-[9px] text-muted2 leading-relaxed list-disc pl-4">
                {strategy.recommendations.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
              <div className="mt-2 font-mono text-[9px] text-muted">
                hold: {strategy.hold.join(" · ")}
              </div>
            </div>
          </div>
        )}

        <FanvueClient drafts={drafts} dayById={dayById} thumbByDay={thumbByDay} funnelChars={funnelChars} />
      </main>
    </div>
  );
}
