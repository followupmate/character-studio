import { supabase } from "@/lib/supabase";
import Sidebar from "@/components/dashboard/Sidebar";
import FanvueClient from "./FanvueClient";
import { isFlagOn } from "@/lib/featureFlags";
import { deriveStrategy, FanvueSnapshot } from "@/lib/fanvueStrategy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getData() {
  const [{ data: drafts }, { data: characters }] = await Promise.all([
    supabase
      .from("chs_fanvue_unlocks")
      .select("id, series_name, title, teaser_text, sales_copy, suggested_price, intensity, ig_cta, fanvue_prompt, unlock_type, status, story_day_id, created_at, media_urls, published_at, publish_error")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("chs_characters").select("id, name, feature_flags, fanvue_snapshot").eq("is_active", true),
  ]);

  const dayIds = Array.from(new Set((drafts ?? []).map((d) => d.story_day_id).filter(Boolean))) as string[];
  const { data: days } = dayIds.length
    ? await supabase.from("chs_story_days").select("id, date, tier, location").in("id", dayIds)
    : { data: [] };
  const dayById = new Map((days ?? []).map((d) => [d.id, d]));

  // Read-only MCP audit panel (gated by mcp_audit flag) — show the agent-audited Fanvue snapshot + strategy.
  const auditChar = (characters ?? []).find((c) => isFlagOn(c.feature_flags, "mcp_audit") && c.fanvue_snapshot);
  const snapshot = (auditChar?.fanvue_snapshot ?? null) as FanvueSnapshot | null;
  const strategy = deriveStrategy(snapshot);

  return { drafts: drafts ?? [], dayById: Object.fromEntries(dayById), snapshot, strategy, auditName: auditChar?.name ?? null };
}

export default async function FanvuePage() {
  const { drafts, dayById, snapshot, strategy, auditName } = await getData();
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

        <FanvueClient drafts={drafts} dayById={dayById} />
      </main>
    </div>
  );
}
