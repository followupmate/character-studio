"use client";

import { useState, useEffect } from "react";

type ShotStep = "bridge" | "private_access" | "escalation" | "reveal" | "payoff" | "afterglow";
type ContentLevel = "premium_sensual" | "erotic_tease" | "explicit_adult";

interface FanvueShot {
  step: ShotStep;
  prompt: string;
  intensity: "soft" | "medium" | "strong";
  media_url: string | null;
  status: "pending" | "generated" | "approved" | "failed";
}
interface ContinuationPlan {
  source_tease: string;
  paid_promise: string;
  same_event_continuity: string;
  content_level: ContentLevel;
  set_format: string;
  commercial: { mode: string; price_eur: number; price_rationale: string[] };
  shots: FanvueShot[];
}
interface Draft {
  id: string;
  character_id?: string | null;
  series_name: string;
  title: string;
  teaser_text: string | null;
  sales_copy: string | null;
  suggested_price: number | null;
  intensity: string | null;
  ig_cta: string | null;
  fanvue_prompt: string | null;
  unlock_type: string | null;
  status: string | null;
  story_day_id: string | null;
  created_at: string;
  media_urls?: string[] | null;
  published_at?: string | null;
  publish_error?: string | null;
  pipeline_version?: string | null;
  content_level?: ContentLevel | null;
  continuation_plan?: ContinuationPlan | null;
}
interface FanvueTension { potential: "none" | "soft" | "clear" | "strong"; continuation?: string | null; withheld_element?: string | null }
interface Day {
  id: string;
  date: string;
  tier: string | null;
  location: string | null;
  hook_text?: string | null;
  ig_caption?: string | null;
  // Item 3 — read-only, sourced from chs_story_days.scene.situation.fanvue_tension in page.tsx.
  // Absent (undefined/null) for older days with no situation — rendered as a graceful no-op.
  fanvue_tension?: FanvueTension | null;
}

const STATUS_STYLES: Record<string, string> = {
  draft: "text-amber border-amber/30 bg-amber/10",
  ready: "text-teal border-teal/30 bg-teal/10",
  posted: "text-accent border-accent/30 bg-accent/10",
  archived: "text-muted border-border bg-surface-high",
};
const INTENSITY_STYLES: Record<string, string> = {
  soft: "text-teal", medium: "text-amber", strong: "text-red-400",
};
const CONTENT_LEVEL_STYLES: Record<ContentLevel, string> = {
  premium_sensual: "text-teal border-teal/30 bg-teal/10",
  erotic_tease: "text-red-400 border-red-400/30 bg-red-400/10",
  explicit_adult: "text-muted2 border-border bg-surface-high",
};
const STEP_LABELS: Record<ShotStep, string> = {
  bridge: "1 · Bridge",
  private_access: "2 · Private access",
  escalation: "3 · Escalation",
  reveal: "4 · Reveal",
  payoff: "5 · Payoff",
  afterglow: "6 · Afterglow",
};

interface FunnelChar { id: string; name: string; fanvue_link: string | null; adult_content_verified?: boolean }

export default function FanvueClient({
  drafts,
  dayById,
  thumbByDay = {},
  funnelChars = [],
}: {
  drafts: Draft[];
  dayById: Record<string, Day>;
  thumbByDay?: Record<string, string>;
  funnelChars?: FunnelChar[];
}) {
  const [items, setItems] = useState(drafts);
  const [busy, setBusy] = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [converting, setConverting] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [health, setHealth] = useState<{ configured: boolean; ok: boolean; detail: string; higgsfield?: { configured: boolean } } | null>(null);
  const [links, setLinks] = useState<Record<string, string>>(
    () => Object.fromEntries(funnelChars.map((c) => [c.id, c.fanvue_link ?? ""]))
  );
  const [savingLink, setSavingLink] = useState<string | null>(null);
  const [savedLink, setSavedLink] = useState<string | null>(null);
  const [adultVerified, setAdultVerified] = useState<Record<string, boolean>>(
    () => Object.fromEntries(funnelChars.map((c) => [c.id, !!c.adult_content_verified]))
  );
  const [savingAdult, setSavingAdult] = useState<string | null>(null);
  // Local-only "copy reviewed" checklist tick per draft — part of the publish checklist gate.
  const [reviewed, setReviewed] = useState<Record<string, boolean>>({});
  const [warnings, setWarnings] = useState<Record<string, string[]>>({});
  const [shotDrafts, setShotDrafts] = useState<Record<string, string>>({});
  const [planDrafts, setPlanDrafts] = useState<Record<string, { source_tease?: string; paid_promise?: string }>>({});
  const [manualUrl, setManualUrl] = useState<Record<string, string>>({});
  // Item 1 — teaser/sales copy/IG CTA drafts (top-level DB columns, patched directly via update()).
  const [copyDrafts, setCopyDrafts] = useState<Record<string, { teaser_text?: string; sales_copy?: string; ig_cta?: string }>>({});
  // Item 0 / item 7 — surfaced alongside the existing paidValueWarning (`warnings` state above).
  const [sourceWarnings, setSourceWarnings] = useState<Record<string, string[]>>({});
  const [promptRiskWarnings, setPromptRiskWarnings] = useState<Record<string, string>>({});
  // Item 9 — real file upload state: per-shot selected file + local preview + upload-in-flight.
  const [uploadFiles, setUploadFiles] = useState<Record<string, File | null>>({});
  const [uploadPreviews, setUploadPreviews] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/fanvue/health").then((r) => r.json()).then(setHealth).catch(() => {});
  }, []);

  // IG → Fanvue funnel link: goes into the IG bio manually, and the engine uses it
  // automatically as the Story link sticker on every scheduled story.
  async function saveLink(charId: string) {
    setSavingLink(charId);
    try {
      await fetch("/api/characters/update", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: charId, fanvue_link: (links[charId] ?? "").trim() || null }),
      });
      setSavedLink(charId);
      setTimeout(() => setSavedLink(null), 2000);
    } finally { setSavingLink(null); }
  }

  // adult_content_verified: explicit 18+ confirmation gate for content_level="explicit_adult".
  // Manual only — never inferred from backstory/prompt/appearance.
  async function toggleAdultVerified(charId: string, value: boolean) {
    if (value && !window.confirm("Potvrdzujem, že táto postava je jednoznačne zobrazená ako dospelá (18+) a explicit_adult obsah je pre ňu povolený.")) return;
    setSavingAdult(charId);
    try {
      const res = await fetch("/api/characters/update", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: charId, adult_content_verified: value }),
      });
      if (res.ok) setAdultVerified((a) => ({ ...a, [charId]: value }));
    } finally { setSavingAdult(null); }
  }

  async function update(id: string, patch: Record<string, unknown>) {
    setBusy(id);
    try {
      const res = await fetch("/api/characters/fanvue-unlocks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch, ...(data.update ?? {}) } : x)));
        setWarnings((w) => ({ ...w, [id]: data.paidValueWarning ?? [] }));
        setSourceWarnings((w) => ({ ...w, [id]: data.sourceValidationWarning ?? [] }));
      } else {
        window.alert(data.error ?? `Chyba ${res.status}`);
      }
      return data;
    } finally { setBusy(null); }
  }

  // Marking a draft "ready" is gated server-side: if it's an erotic_tease set that doesn't
  // clearly beat Instagram, the API returns 409 + paidValueWarning instead of applying the
  // status change. This is a hard block, not a silent warning — the user must explicitly
  // confirm before the weak set is allowed to reach "ready" (and from there, publish).
  async function markReady(id: string, confirmWeak = false, confirmSource = false) {
    setBusy(id);
    try {
      const res = await fetch("/api/characters/fanvue-unlocks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id, status: "ready",
          ...(confirmWeak ? { confirmWeakPaidValue: true } : {}),
          ...(confirmSource ? { confirmWeakSource: true } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setItems((xs) => xs.map((x) => (x.id === id ? { ...x, status: "ready", ...(data.update ?? {}) } : x)));
        setWarnings((w) => ({ ...w, [id]: data.paidValueWarning ?? [] }));
        setSourceWarnings((w) => ({ ...w, [id]: data.sourceValidationWarning ?? [] }));
        return;
      }
      if (res.status === 409 && data.requiresConfirmation) {
        setBusy(null);
        // Item 0 — a separate confirm dialog for the source-eligibility gate (distinct reasons
        // from the paid-value gate, same hard-409-unless-confirmed contract).
        if (data.sourceValidationWarning) {
          const reasons = (data.sourceValidationWarning ?? []).join("\n- ");
          const proceed = window.confirm(
            `Zdrojová situácia tohto dňa nespĺňa eligibility kontrolu pre intimate_aesthetic:\n- ${reasons}\n\nOznačiť ako ready aj napriek tomu?`
          );
          if (proceed) await markReady(id, confirmWeak, true);
          return;
        }
        const reasons = (data.paidValueWarning ?? []).join("\n- ");
        const proceed = window.confirm(
          `Tento erotic_tease set nespĺňa paid-value kontrolu:\n- ${reasons}\n\nOznačiť ako ready aj napriek tomu?`
        );
        if (proceed) await markReady(id, true, confirmSource);
        return;
      }
      window.alert(data.error ?? `Chyba ${res.status}`);
    } finally { setBusy(null); }
  }

  async function convertToV1(id: string) {
    if (!window.confirm("Vytvoriť nový fanvue_paid_continuation_v1 plán pre tento draft? Pôvodný jednoduchý prompt sa nahradí 6-shot storyboardom (bridge → afterglow). Táto akcia sa nedá vrátiť.")) return;
    setConverting(id);
    try {
      await update(id, { convertToV1: true });
    } finally { setConverting(null); }
  }

  // Step 1: generate the sellable set. Legacy drafts always generate 3 fixed-angle shots from
  // fanvue_prompt; v1 drafts generate from continuation_plan.shots — pass `step` to regenerate
  // just one shot instead of the whole set.
  async function generateSet(id: string, step?: ShotStep) {
    const key = step ? `${id}:${step}` : id;
    setGenerating(key);
    try {
      const res = await fetch("/api/fanvue/generate-media", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unlockId: id, count: 3, step }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Chyba ${res.status}`);
      setItems((xs) => xs.map((x) => (x.id === id
        ? { ...x, media_urls: data.media_urls, continuation_plan: data.continuation_plan ?? x.continuation_plan, publish_error: null }
        : x)));
    } catch (e) {
      setItems((xs) => xs.map((x) => (x.id === id ? { ...x, publish_error: e instanceof Error ? e.message : String(e) } : x)));
    } finally { setGenerating(null); }
  }

  // Manual path for content_level="explicit_adult" (current provider doesn't generate it —
  // see lib/fanvueMediaProvider.ts): attach an externally produced URL and mark it approved.
  async function attachManualShot(id: string, step: ShotStep) {
    const url = (manualUrl[`${id}:${step}`] ?? "").trim();
    if (!url) return;
    await update(id, { shotPatch: { step, mediaUrl: url, approve: true } });
    setManualUrl((m) => ({ ...m, [`${id}:${step}`]: "" }));
  }

  async function saveShotPrompt(id: string, step: ShotStep) {
    const shotKey = `${id}:${step}`;
    const text = shotDrafts[shotKey];
    if (text === undefined) return;
    const data = await update(id, { shotPatch: { step, prompt: text } });
    // Item 7 — keyed per-shot (not per-draft) so the warning attaches to the specific shot that
    // was actually just edited, not every locally-edited shot in the draft.
    setPromptRiskWarnings((w) => ({ ...w, [shotKey]: data?.promptRiskWarning ?? "" }));
  }

  async function savePlanField(id: string, field: "source_tease" | "paid_promise") {
    const value = planDrafts[id]?.[field];
    if (value === undefined) return;
    await update(id, { planPatch: { [field]: value } });
  }

  // Item 1 — teaser_text/sales_copy/ig_cta are top-level chs_fanvue_unlocks columns (already in
  // the route's EDITABLE list), patched directly via update() — no planPatch nesting needed.
  async function saveCopyField(id: string, field: "teaser_text" | "sales_copy" | "ig_cta") {
    const value = copyDrafts[id]?.[field];
    if (value === undefined) return;
    await update(id, { [field]: value });
  }

  // Item 9 — real file upload (primary path): POST the file to a dedicated upload route, which
  // stores it in Supabase Storage and returns a public URL, then attach it via the same
  // shotPatch.mediaUrl mechanism the URL-paste fallback below uses (so "replace" behavior is
  // identical either way).
  async function uploadShotFile(id: string, step: ShotStep) {
    const shotKey = `${id}:${step}`;
    const file = uploadFiles[shotKey];
    if (!file) return;
    setUploading(shotKey);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("unlockId", id);
      form.append("step", step);
      const res = await fetch("/api/fanvue/upload-media", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(data.error ?? `Upload zlyhal (${res.status})`);
        return;
      }
      await update(id, { shotPatch: { step, mediaUrl: data.url, approve: true } });
      setUploadFiles((m) => ({ ...m, [shotKey]: null }));
      setUploadPreviews((m) => { const next = { ...m }; delete next[shotKey]; return next; });
    } finally { setUploading(null); }
  }

  function pickShotFile(id: string, step: ShotStep, file: File | null) {
    const shotKey = `${id}:${step}`;
    setUploadFiles((m) => ({ ...m, [shotKey]: file }));
    setUploadPreviews((m) => {
      const next = { ...m };
      if (next[shotKey]) URL.revokeObjectURL(next[shotKey]);
      if (file) next[shotKey] = URL.createObjectURL(file);
      else delete next[shotKey];
      return next;
    });
  }

  // Step 2: publish to Fanvue — explicit confirm, nothing automatic
  async function publish(id: string, mode: "post" | "mass_message") {
    const item = items.find((x) => x.id === id);
    const priceEur = Number(prices[id] ?? item?.suggested_price ?? 0) || 0;
    const label = mode === "mass_message"
      ? `Poslať PPV správu všetkým subscriberom za ${priceEur > 0 ? `€${priceEur.toFixed(2)}` : "zadarmo"}?`
      : `Publikovať post na Fanvue ${priceEur > 0 ? `s cenou €${priceEur.toFixed(2)}` : "zadarmo (subscribers only)"}?`;
    if (!window.confirm(label)) return;

    setPublishing(id);
    try {
      const res = await fetch("/api/fanvue/publish", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unlockId: id, mode, priceEur }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Chyba ${res.status}`);
      setItems((xs) => xs.map((x) => (x.id === id ? { ...x, status: "posted", published_at: new Date().toISOString(), publish_error: null } : x)));
    } catch (e) {
      setItems((xs) => xs.map((x) => (x.id === id ? { ...x, publish_error: e instanceof Error ? e.message : String(e) } : x)));
    } finally { setPublishing(null); }
  }

  async function savePrice(id: string) {
    const value = Number(prices[id]);
    if (!Number.isFinite(value)) return;
    await update(id, { suggested_price: value });
  }

  if (items.length === 0) {
    return <div className="p-8 font-mono text-[11px] text-muted">No Fanvue drafts yet. Turn on the <span className="text-teal">fanvue_drafts</span> flag and run a daily batch — drafts appear here for review (never auto-published).</div>;
  }

  return (
    <div className="p-4 lg:p-8 space-y-4">
      {/* Fanvue API status */}
      {health && (
        <div className={`px-4 py-2.5 border font-mono text-[10px] flex items-center gap-3 flex-wrap ${
          health.ok ? "bg-teal/5 border-teal/20 text-teal" : "bg-amber/5 border-amber/20 text-amber"
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${health.ok ? "bg-teal" : "bg-amber"}`} />
          <span className="flex-1 min-w-0">
            {health.ok
              ? "Fanvue API pripojené (OAuth) — publish je aktívny"
              : !health.configured
                ? "FANVUE_CLIENT_ID / FANVUE_CLIENT_SECRET chýbajú vo Vercel env (Fanvue → Builder area → Create app)"
                : `Fanvue: ${health.detail}`}
          </span>
          {!health.ok && health.configured && (
            <a
              href="/api/auth/fanvue"
              className="font-mono text-[9px] uppercase tracking-[0.05em] bg-accent/10 border border-accent/30 text-accent px-3 py-1 hover:bg-accent/20 transition-colors flex-shrink-0"
            >
              → Pripojiť Fanvue (OAuth)
            </a>
          )}
        </div>
      )}

      {/* Item 11 — Higgsfield credential status, surfaced proactively before the user clicks generate */}
      {health && !health.higgsfield?.configured && (
        <div className="px-4 py-2.5 border border-amber/20 bg-amber/5 text-amber font-mono text-[10px] flex items-center gap-3">
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-amber" />
          <span>HIGGSFIELD_API_KEY nie je nastavený — automatické generovanie shotov nebude fungovať (manuálny upload/URL nižšie stále funguje pre všetky content levels).</span>
        </div>
      )}

      {/* Workflow explainer — shown once, applies to fanvue_paid_continuation_v1 cards below */}
      <div className="bg-[#050709] border border-border p-3 font-mono text-[9px] text-muted2 flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <span className="text-teal">Instagram teaser</span><span>→</span>
        <span>paid promise</span><span>→</span>
        <span>approve content level</span><span>→</span>
        <span>generate storyboard</span><span>→</span>
        <span>generate set</span><span>→</span>
        <span>review individual shots</span><span>→</span>
        <span>approve price and copy</span><span>→</span>
        <span className="text-accent">publish to Fanvue</span>
      </div>

      {/* IG → Fanvue funnel link + 18+ verification per character */}
      {funnelChars.length > 0 && (
        <div className="bg-[#050709] border border-border p-4">
          <p className="font-mono text-[9px] text-muted uppercase tracking-[0.15em] mb-1">// IG → Fanvue link + Character Settings</p>
          <p className="font-mono text-[9px] text-muted2 leading-relaxed mb-3">
            Tento link patrí do IG bio (manuálne, raz) a engine ho automaticky pridáva ako link sticker na každú
            naplánovanú Story. „18+ verified“ je manuálne potvrdenie, že postava je jednoznačne dospelá — jediná
            podmienka, ktorá odomyká content_level „explicit_adult“ (nikdy sa neodvodzuje automaticky).
          </p>
          <div className="space-y-2">
            {funnelChars.map((c) => (
              <div key={c.id} className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-[10px] text-ink w-24 flex-shrink-0 truncate">{c.name}</span>
                <input
                  type="url"
                  value={links[c.id] ?? ""}
                  onChange={(e) => setLinks((l) => ({ ...l, [c.id]: e.target.value }))}
                  placeholder="https://www.fanvue.com/tvoj-handle"
                  className="flex-1 min-w-[200px] bg-bg border border-border font-mono text-[10px] text-ink px-2.5 py-1.5 focus:outline-none focus:border-teal"
                />
                <button
                  onClick={() => saveLink(c.id)}
                  disabled={savingLink === c.id}
                  className="font-mono text-[9px] uppercase bg-teal/10 border border-teal/30 text-teal px-3 py-1.5 hover:bg-teal/20 transition-colors disabled:opacity-50"
                >
                  {savedLink === c.id ? "✓" : savingLink === c.id ? "…" : "Uložiť"}
                </button>
                <label className="flex items-center gap-1.5 font-mono text-[9px] text-muted flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={!!adultVerified[c.id]}
                    disabled={savingAdult === c.id}
                    onChange={(e) => toggleAdultVerified(c.id, e.target.checked)}
                  />
                  18+ verified
                </label>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
      {items.map((d) => {
        const day = d.story_day_id ? dayById[d.story_day_id] : undefined;
        const thumb = d.story_day_id ? thumbByDay[d.story_day_id] : undefined;
        const isV1 = d.pipeline_version === "paid_continuation_v1" && !!d.continuation_plan;

        if (!isV1) {
          return (
            <div key={d.id} className="bg-[#050709] border border-border p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[8px] uppercase tracking-[0.1em] px-1.5 py-0.5 border border-muted/30 text-muted">legacy draft</span>
                  </div>
                  <div className="font-mono text-[11px] text-ink uppercase tracking-[0.05em] mt-1">{d.series_name}</div>
                  <div className="font-mono text-[10px] text-muted2 mt-0.5">{d.title}</div>
                </div>
                <span className={`font-mono text-[8px] uppercase tracking-[0.1em] px-2 py-0.5 border ${STATUS_STYLES[d.status ?? "draft"]}`}>{d.status}</span>
              </div>

              <div className="flex flex-wrap gap-2 font-mono text-[9px] text-muted">
                <span className="border border-border px-1.5 py-0.5">{d.unlock_type}</span>
                <span className="border border-border px-1.5 py-0.5">${Number(d.suggested_price ?? 0).toFixed(2)}</span>
                <span className={`border border-border px-1.5 py-0.5 ${INTENSITY_STYLES[d.intensity ?? "medium"]}`}>intensity: {d.intensity}</span>
                {day && <span className="border border-border px-1.5 py-0.5">{day.tier} · {day.date}</span>}
              </div>

              {d.teaser_text && <div className="font-mono text-[10px] text-teal">“{d.teaser_text}”</div>}
              {d.sales_copy && <div className="font-mono text-[10px] text-muted2 leading-relaxed">{d.sales_copy}</div>}
              <div className="font-mono text-[9px] text-muted">
                IG CTA: {d.ig_cta ? <span className="text-amber">“{d.ig_cta}”</span> : <span className="text-muted/50">none (kept lifestyle)</span>}
              </div>
              {d.fanvue_prompt && (
                <details className="font-mono text-[9px] text-muted2">
                  <summary className="cursor-pointer text-muted">fanvue prompt</summary>
                  <p className="mt-1 leading-relaxed">{d.fanvue_prompt}</p>
                </details>
              )}

              <button
                onClick={() => convertToV1(d.id)}
                disabled={converting === d.id}
                className="font-mono text-[9px] uppercase bg-red-400/10 border border-red-400/30 text-red-400 px-2.5 py-1.5 hover:bg-red-400/20 transition-colors disabled:opacity-50 self-start"
              >
                {converting === d.id ? "Vytváram plán…" : "↻ Vytvoriť nový plán (fanvue_paid_continuation_v1)"}
              </button>

              {/* Generated set (step 1) */}
              <div className="border border-border p-2.5 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[8px] text-muted uppercase tracking-[0.1em]">Set · {(d.media_urls ?? []).length} fotiek</span>
                  <button
                    onClick={() => generateSet(d.id)}
                    disabled={generating === d.id}
                    className="font-mono text-[9px] uppercase bg-accent/10 border border-accent/30 text-accent px-2.5 py-1 hover:bg-accent/20 transition-colors disabled:opacity-50"
                  >
                    {generating === d.id ? "Generujem… (~2 min)" : (d.media_urls?.length ? "↻ Pregenerovať set" : "⚡ Vygeneruj set (3)")}
                  </button>
                </div>
                {(d.media_urls ?? []).length > 0 && (
                  <div className="flex gap-1.5 overflow-x-auto">
                    {(d.media_urls ?? []).map((u, i) => (
                      <a key={i} href={u} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u} alt={`set ${i + 1}`} className="h-24 w-auto object-cover border border-border" />
                      </a>
                    ))}
                  </div>
                )}
              </div>

              {/* Publish to Fanvue (step 2 — explicit, confirmed) */}
              {(d.media_urls ?? []).length > 0 && d.status !== "posted" && (
                <div className="border border-teal/20 bg-teal/5 p-2.5 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[8px] text-muted uppercase tracking-[0.1em] flex-shrink-0">Cena €</span>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={prices[d.id] ?? String(d.suggested_price ?? 0)}
                      onChange={(e) => setPrices((p) => ({ ...p, [d.id]: e.target.value }))}
                      className="w-20 bg-bg border border-border font-mono text-[10px] text-ink px-2 py-1 focus:outline-none focus:border-teal"
                    />
                    <span className="font-mono text-[8px] text-muted">0 = zadarmo · min platené €3</span>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => publish(d.id, "post")}
                      disabled={publishing === d.id}
                      className="flex-1 font-mono text-[9px] uppercase bg-teal/10 border border-teal/30 text-teal py-1.5 hover:bg-teal/20 transition-colors disabled:opacity-50"
                    >
                      {publishing === d.id ? "Publikujem…" : "→ Fanvue post"}
                    </button>
                    <button
                      onClick={() => publish(d.id, "mass_message")}
                      disabled={publishing === d.id}
                      className="flex-1 font-mono text-[9px] uppercase bg-amber/10 border border-amber/30 text-amber py-1.5 hover:bg-amber/20 transition-colors disabled:opacity-50"
                    >
                      {publishing === d.id ? "Posielam…" : "→ PPV správa subs"}
                    </button>
                  </div>
                </div>
              )}

              {d.published_at && (
                <div className="font-mono text-[9px] text-accent">
                  ✓ Publikované na Fanvue · {new Date(d.published_at).toLocaleString("sk-SK")}
                </div>
              )}
              {d.publish_error && (
                <div className="font-mono text-[9px] text-red-400 leading-relaxed break-words">✗ {d.publish_error}</div>
              )}

              {/* Intensity approval (engine proposes, you approve) */}
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[8px] text-muted uppercase">set intensity:</span>
                {(["soft", "medium", "strong"] as const).map((lvl) => (
                  <button key={lvl} onClick={() => update(d.id, { intensity: lvl })} disabled={busy === d.id}
                    className={`font-mono text-[8px] uppercase px-1.5 py-0.5 border ${d.intensity === lvl ? INTENSITY_STYLES[lvl] + " border-current" : "text-muted border-border"}`}>
                    {lvl}
                  </button>
                ))}
              </div>

              <div className="flex gap-2 mt-1">
                {d.status !== "ready" && (
                  <button onClick={() => markReady(d.id)} disabled={busy === d.id}
                    className="flex-1 font-mono text-[9px] uppercase bg-teal/10 border border-teal/30 text-teal py-1.5 disabled:opacity-50">Mark ready</button>
                )}
                {d.status !== "archived" && (
                  <button onClick={() => update(d.id, { status: "archived" })} disabled={busy === d.id}
                    className="font-mono text-[9px] uppercase border border-border text-muted px-3 py-1.5 disabled:opacity-50">Archive</button>
                )}
              </div>
            </div>
          );
        }

        // fanvue_paid_continuation_v1 card
        const plan = d.continuation_plan as ContinuationPlan;
        const charVerified = d.character_id ? !!adultVerified[d.character_id] : false;
        const mediaGenerated = (d.media_urls ?? []).length > 0;
        const isReviewed = !!reviewed[d.id];
        const oauthOk = !!health?.ok;
        const canPublish = mediaGenerated && isReviewed && oauthOk && d.status !== "posted";
        const draftWarnings = warnings[d.id];

        return (
          <div key={d.id} className="bg-[#050709] border border-red-400/20 p-4 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[8px] uppercase tracking-[0.1em] px-1.5 py-0.5 border border-red-400/30 text-red-400">paid_continuation_v1</span>
                  <span className={`font-mono text-[8px] uppercase tracking-[0.1em] px-1.5 py-0.5 border ${CONTENT_LEVEL_STYLES[plan.content_level]}`}>{plan.content_level}</span>
                </div>
                <div className="font-mono text-[11px] text-ink uppercase tracking-[0.05em] mt-1">{d.series_name}</div>
                <div className="font-mono text-[10px] text-muted2 mt-0.5">{d.title}</div>
              </div>
              <span className={`font-mono text-[8px] uppercase tracking-[0.1em] px-2 py-0.5 border ${STATUS_STYLES[d.status ?? "draft"]}`}>{d.status}</span>
            </div>

            {/* Instagram source + thumbnail */}
            <div className="border border-border p-2.5 flex gap-2.5 items-start">
              {thumb && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb} alt="Instagram source" className="h-16 w-16 object-cover border border-border flex-shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[8px] text-muted uppercase tracking-[0.1em]">Instagram ukazuje</div>
                <div className="font-mono text-[10px] text-muted2 leading-relaxed">
                  {day?.hook_text || day?.ig_caption || plan.source_tease}
                </div>
                {day && <div className="font-mono text-[8px] text-muted mt-1">{day.tier} · {day.location} · {day.date}</div>}
                {/* Item 2 — source_tease editing (already wired server-side via savePlanField, only the JSX was missing) */}
                <textarea
                  value={planDrafts[d.id]?.source_tease ?? plan.source_tease}
                  onChange={(e) => setPlanDrafts((p) => ({ ...p, [d.id]: { ...p[d.id], source_tease: e.target.value } }))}
                  rows={2}
                  className="w-full mt-1.5 bg-bg border border-border font-mono text-[9px] text-muted2 px-2 py-1 leading-relaxed focus:outline-none focus:border-teal resize-none"
                />
                <button
                  onClick={() => savePlanField(d.id, "source_tease")}
                  disabled={busy === d.id}
                  className="mt-1 font-mono text-[8px] uppercase border border-border text-muted px-2 py-1 disabled:opacity-50"
                >
                  Uložiť source tease
                </button>
              </div>
            </div>

            {/* Item 3 — fanvue_tension, previously only surfaced indirectly inside interpolated prompt text */}
            {day?.fanvue_tension && day.fanvue_tension.potential !== "none" && (
              <div className="border border-amber/20 bg-amber/5 p-2.5 flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[8px] text-amber uppercase tracking-[0.1em]">Fanvue tension</span>
                  <span className="font-mono text-[8px] uppercase px-1.5 py-0.5 border border-amber/30 text-amber">{day.fanvue_tension.potential}</span>
                </div>
                {day.fanvue_tension.continuation && (
                  <div className="font-mono text-[9px] text-muted2 leading-relaxed">{day.fanvue_tension.continuation}</div>
                )}
                {day.fanvue_tension.withheld_element && (
                  <div className="font-mono text-[9px] text-amber leading-relaxed">withheld from IG: {day.fanvue_tension.withheld_element}</div>
                )}
              </div>
            )}

            {/* Paid promise + Fanvue tension */}
            <div className="border border-teal/20 bg-teal/5 p-2.5 flex flex-col gap-1.5">
              <div className="font-mono text-[8px] text-teal uppercase tracking-[0.1em]">Platiaci zákazník dostane</div>
              <textarea
                value={planDrafts[d.id]?.paid_promise ?? plan.paid_promise}
                onChange={(e) => setPlanDrafts((p) => ({ ...p, [d.id]: { ...p[d.id], paid_promise: e.target.value } }))}
                rows={2}
                className="w-full bg-bg border border-border font-mono text-[10px] text-ink px-2 py-1.5 leading-relaxed focus:outline-none focus:border-teal resize-none"
              />
              <button
                onClick={() => savePlanField(d.id, "paid_promise")}
                disabled={busy === d.id}
                className="self-start font-mono text-[8px] uppercase bg-teal/10 border border-teal/30 text-teal px-2 py-1 disabled:opacity-50"
              >
                Uložiť
              </button>
              <div className="font-mono text-[8px] text-muted mt-1">{plan.same_event_continuity}</div>
            </div>

            {/* Item 1 — teaser/sales copy/IG CTA editing (route already supports these via EDITABLE; only the JSX was missing) */}
            <div className="border border-border p-2.5 flex flex-col gap-1.5">
              <span className="font-mono text-[8px] text-muted uppercase tracking-[0.1em]">Copy</span>
              {(["teaser_text", "sales_copy", "ig_cta"] as const).map((field) => (
                <div key={field} className="flex flex-col gap-1">
                  <span className="font-mono text-[8px] text-muted">{field}</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      value={copyDrafts[d.id]?.[field] ?? (d[field] ?? "")}
                      onChange={(e) => setCopyDrafts((c) => ({ ...c, [d.id]: { ...c[d.id], [field]: e.target.value } }))}
                      className="flex-1 min-w-0 bg-bg border border-border font-mono text-[9px] text-ink px-2 py-1 focus:outline-none focus:border-teal"
                    />
                    <button
                      onClick={() => saveCopyField(d.id, field)}
                      disabled={busy === d.id}
                      className="font-mono text-[8px] uppercase border border-border text-muted px-2 py-1 disabled:opacity-50 flex-shrink-0"
                    >
                      Uložiť
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Content level selector */}
            <div className="flex flex-col gap-1">
              <span className="font-mono text-[8px] text-muted uppercase tracking-[0.1em]">content level</span>
              <div className="flex gap-1.5 flex-wrap">
                {(["premium_sensual", "erotic_tease", "explicit_adult"] as ContentLevel[]).map((lvl) => {
                  const disabled = busy === d.id || (lvl === "explicit_adult" && !charVerified);
                  return (
                    <button
                      key={lvl}
                      onClick={() => update(d.id, { contentLevel: lvl })}
                      disabled={disabled}
                      title={lvl === "explicit_adult" && !charVerified ? "Vyžaduje 18+ verified na tejto postave (viď sekcia Character Settings vyššie)" : undefined}
                      className={`font-mono text-[8px] uppercase px-2 py-1 border ${plan.content_level === lvl ? CONTENT_LEVEL_STYLES[lvl] + " border-current" : "text-muted border-border"} disabled:opacity-40`}
                    >
                      {lvl}
                    </button>
                  );
                })}
              </div>
              {plan.content_level === "erotic_tease" && (
                <p className="font-mono text-[8px] text-red-400/80 leading-relaxed">
                  Strongest provider-safe paid set. Designed to maximize erotic value without triggering current NSFW blocking.
                </p>
              )}
              {plan.content_level === "explicit_adult" && (
                <p className="font-mono text-[8px] text-muted leading-relaxed">
                  Aktuálny provider (Higgsfield) tento content level nepodporuje — negeneruje sa automaticky. Nahraj set
                  manuálne (externe vytvorený a manuálne schválený) v jednotlivých shotoch nižšie.
                </p>
              )}
            </div>

            {/* Storyboard */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[8px] text-muted uppercase tracking-[0.1em]">Storyboard · {plan.set_format} · {plan.shots.filter((s) => s.media_url).length}/{plan.shots.length} vygenerované</span>
                {plan.content_level !== "explicit_adult" && (
                  <button
                    onClick={() => generateSet(d.id)}
                    disabled={generating === d.id}
                    className="font-mono text-[9px] uppercase bg-accent/10 border border-accent/30 text-accent px-2.5 py-1 hover:bg-accent/20 transition-colors disabled:opacity-50"
                  >
                    {generating === d.id ? "Generujem set… (~2 min)" : "⚡ Vygeneruj celý set"}
                  </button>
                )}
              </div>

              {plan.shots.map((shot) => {
                const shotKey = `${d.id}:${shot.step}`;
                const shotBusy = generating === shotKey;
                const shotUploading = uploading === shotKey;
                const preview = uploadPreviews[shotKey];
                const promptRisk = promptRiskWarnings[shotKey];
                return (
                  <div key={shot.step} className="border border-border p-2 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[8px] text-ink uppercase tracking-[0.1em]">{STEP_LABELS[shot.step]}</span>
                      <span className={`font-mono text-[8px] uppercase ${INTENSITY_STYLES[shot.intensity]}`}>{shot.intensity}</span>
                      <span className="font-mono text-[8px] text-muted">{shot.status}</span>
                    </div>
                    <textarea
                      value={shotDrafts[shotKey] ?? shot.prompt}
                      onChange={(e) => setShotDrafts((s) => ({ ...s, [shotKey]: e.target.value }))}
                      rows={2}
                      className="w-full bg-bg border border-border font-mono text-[9px] text-muted2 px-2 py-1 leading-relaxed focus:outline-none focus:border-teal resize-none"
                    />
                    {/* Item 7 — non-blocking duplicate-person-risk warning on the currently edited prompt */}
                    {promptRisk && (
                      <div className="font-mono text-[8px] text-amber leading-relaxed">⚠ {promptRisk}</div>
                    )}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        onClick={() => saveShotPrompt(d.id, shot.step)}
                        disabled={busy === d.id}
                        className="font-mono text-[8px] uppercase border border-border text-muted px-2 py-1 disabled:opacity-50"
                      >
                        Uložiť prompt
                      </button>
                      {/* Item 9 — generate is hidden only for explicit_adult (no provider supports it);
                          real file upload + URL-attach fallback are now available for EVERY content level. */}
                      {plan.content_level !== "explicit_adult" && (
                        <button
                          onClick={() => generateSet(d.id, shot.step)}
                          disabled={shotBusy}
                          className="font-mono text-[8px] uppercase bg-accent/10 border border-accent/30 text-accent px-2 py-1 disabled:opacity-50"
                        >
                          {shotBusy ? "Generujem…" : shot.media_url ? "↻ Pregenerovať shot" : "⚡ Generovať shot"}
                        </button>
                      )}
                      {shot.media_url && (
                        <a href={shot.media_url} target="_blank" rel="noopener noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={shot.media_url} alt={shot.step} className="h-12 w-12 object-cover border border-border" />
                        </a>
                      )}
                    </div>

                    {/* Item 9 — real file upload (primary path), with client-side preview */}
                    <div className="flex items-center gap-1.5 flex-wrap border-t border-border pt-1.5 mt-0.5">
                      <span className="font-mono text-[8px] text-muted flex-shrink-0">Nahrať súbor</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) => pickShotFile(d.id, shot.step, e.target.files?.[0] ?? null)}
                        className="flex-1 min-w-[140px] font-mono text-[8px] text-muted2"
                      />
                      {preview && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={preview} alt="náhľad" className="h-10 w-10 object-cover border border-border flex-shrink-0" />
                      )}
                      <button
                        onClick={() => uploadShotFile(d.id, shot.step)}
                        disabled={shotUploading || !uploadFiles[shotKey]}
                        className="font-mono text-[8px] uppercase bg-teal/10 border border-teal/30 text-teal px-2 py-1 disabled:opacity-50 flex-shrink-0"
                      >
                        {shotUploading ? "Nahrávam…" : "↑ Nahrať a schváliť"}
                      </button>
                    </div>

                    {/* Item 9 — URL-attach kept as a clearly-labelled secondary fallback, not the primary path */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-[8px] text-muted flex-shrink-0">alebo</span>
                      <input
                        type="url"
                        placeholder="Pripojiť cez URL"
                        value={manualUrl[shotKey] ?? ""}
                        onChange={(e) => setManualUrl((m) => ({ ...m, [shotKey]: e.target.value }))}
                        className="flex-1 min-w-[120px] bg-bg border border-border font-mono text-[8px] text-ink px-1.5 py-1 focus:outline-none focus:border-teal"
                      />
                      <button
                        onClick={() => attachManualShot(d.id, shot.step)}
                        disabled={busy === d.id || !manualUrl[shotKey]}
                        className="font-mono text-[8px] uppercase border border-border text-muted px-2 py-1 disabled:opacity-50 flex-shrink-0"
                      >
                        Pripojiť cez URL
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {draftWarnings && draftWarnings.length > 0 && (
              <div className="border border-amber/30 bg-amber/5 p-2 font-mono text-[8px] text-amber leading-relaxed">
                ⚠ Paid-value check: {draftWarnings.join("; ")}
              </div>
            )}
            {/* Item 0 — source-eligibility warning, distinct from the paid-value check above */}
            {sourceWarnings[d.id] && sourceWarnings[d.id].length > 0 && (
              <div className="border border-amber/30 bg-amber/5 p-2 font-mono text-[8px] text-amber leading-relaxed">
                ⚠ Source eligibility: {sourceWarnings[d.id].join("; ")}
              </div>
            )}

            {/* Commercial setup */}
            <div className="border border-border p-2.5 flex flex-col gap-1.5">
              <span className="font-mono text-[8px] text-muted uppercase tracking-[0.1em]">Commercial setup</span>
              {/* Item 4 — real subscription/PPV/bundle switch (was previously a read-only label derived
                  from FANVUE_RULES[tier]). Overriding here patches unlock_type + continuation_plan.commercial.mode
                  in one transaction, independent of buildFanvueContinuationPlan/buildCommercialSetup. */}
              <div className="flex gap-1.5 flex-wrap">
                {(["subscription", "ppv", "bundle"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => update(d.id, { commercialModeOverride: mode })}
                    disabled={busy === d.id}
                    className={`font-mono text-[8px] uppercase px-2 py-1 border ${plan.commercial.mode === mode ? "text-teal border-teal" : "text-muted border-border"} disabled:opacity-40`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <p className="font-mono text-[8px] text-muted/70 leading-relaxed">
                Zmena content levelu prebuduje celý plán (vrátane commercial.mode z tier baseline) a tento override sa stratí.
              </p>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[8px] text-muted flex-shrink-0">Cena €</span>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={prices[d.id] ?? String(d.suggested_price ?? plan.commercial.price_eur)}
                  onChange={(e) => setPrices((p) => ({ ...p, [d.id]: e.target.value }))}
                  className="w-20 bg-bg border border-border font-mono text-[10px] text-ink px-2 py-1 focus:outline-none focus:border-teal"
                />
                <button onClick={() => savePrice(d.id)} disabled={busy === d.id} className="font-mono text-[8px] uppercase border border-border text-muted px-2 py-1 disabled:opacity-50">
                  Uložiť cenu
                </button>
              </div>
              <ul className="font-mono text-[8px] text-muted2 leading-relaxed list-disc pl-4">
                {plan.commercial.price_rationale.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
              <div className="font-mono text-[9px] text-muted mt-1">
                IG CTA: {d.ig_cta ? <span className="text-amber">“{d.ig_cta}”</span> : <span className="text-muted/50">none (kept lifestyle)</span>}
              </div>
            </div>

            {/* Publish checklist */}
            <div className="border border-border p-2.5 flex flex-col gap-1.5 font-mono text-[9px]">
              <span className="text-muted uppercase tracking-[0.1em] text-[8px]">Publish checklist</span>
              <label className="flex items-center gap-1.5">
                <span className={mediaGenerated ? "text-teal" : "text-muted"}>{mediaGenerated ? "✓" : "○"}</span> media generated
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={isReviewed} onChange={(e) => setReviewed((r) => ({ ...r, [d.id]: e.target.checked }))} />
                copy + shots reviewed
              </label>
              <label className="flex items-center gap-1.5">
                <span className={oauthOk ? "text-teal" : "text-amber"}>{oauthOk ? "✓" : "○"}</span> OAuth / Fanvue API connected
              </label>
            </div>

            {/* Publish to Fanvue (step 2 — explicit, confirmed, gated by the checklist above) */}
            {d.status !== "posted" && (
              <div className="flex gap-1.5">
                <button
                  onClick={() => publish(d.id, "post")}
                  disabled={!canPublish || publishing === d.id}
                  className="flex-1 font-mono text-[9px] uppercase bg-teal/10 border border-teal/30 text-teal py-1.5 hover:bg-teal/20 transition-colors disabled:opacity-40"
                >
                  {publishing === d.id ? "Publikujem…" : "→ Fanvue post"}
                </button>
                <button
                  onClick={() => publish(d.id, "mass_message")}
                  disabled={!canPublish || publishing === d.id}
                  className="flex-1 font-mono text-[9px] uppercase bg-amber/10 border border-amber/30 text-amber py-1.5 hover:bg-amber/20 transition-colors disabled:opacity-40"
                >
                  {publishing === d.id ? "Posielam…" : "→ PPV správa subs"}
                </button>
              </div>
            )}

            {d.published_at && (
              <div className="font-mono text-[9px] text-accent">
                ✓ Publikované na Fanvue · {new Date(d.published_at).toLocaleString("sk-SK")}
              </div>
            )}
            {d.publish_error && (
              <div className="font-mono text-[9px] text-red-400 leading-relaxed break-words">✗ {d.publish_error}</div>
            )}

            <div className="flex gap-2 mt-1">
              {d.status !== "ready" && (
                <button onClick={() => update(d.id, { status: "ready" })} disabled={busy === d.id}
                  className="flex-1 font-mono text-[9px] uppercase bg-teal/10 border border-teal/30 text-teal py-1.5 disabled:opacity-50">Mark ready</button>
              )}
              {d.status !== "archived" && (
                <button onClick={() => update(d.id, { status: "archived" })} disabled={busy === d.id}
                  className="font-mono text-[9px] uppercase border border-border text-muted px-3 py-1.5 disabled:opacity-50">Archive</button>
              )}
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}
