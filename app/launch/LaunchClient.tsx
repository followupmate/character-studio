"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Character = { id: string; name: string; slug: string };

// ── Checklist data ───────────────────────────────────────
type CheckItem = { id: string; text: string; action?: { label: string; href: string } };
type Phase = {
  id: string;
  phase: string;
  title: string;
  accent: string;
  items: CheckItem[];
  reference?: React.ReactNode;
};

const TECH_SPECS = [
  { type: "Feed foto (portrait)", size: "1080 × 1350px", ratio: "4:5", max: "30 MB" },
  { type: "Feed foto (square)", size: "1080 × 1080px", ratio: "1:1", max: "30 MB" },
  { type: "Feed foto (landscape)", size: "1080 × 566px", ratio: "1.91:1", max: "30 MB" },
  { type: "Reel (video)", size: "1080 × 1920px", ratio: "9:16", max: "1 GB" },
  { type: "Story (foto)", size: "1080 × 1920px", ratio: "9:16", max: "30 MB" },
  { type: "Story (video)", size: "1080 × 1920px", ratio: "9:16", max: "4 GB" },
  { type: "Carousel (každý slide)", size: "1080 × 1350px", ratio: "4:5", max: "30 MB" },
  { type: "Profilovka", size: "320 × 320px", ratio: "1:1", max: "—" },
  { type: "Highlight cover", size: "1080 × 1920px", ratio: "9:16", max: "—" },
  { type: "YT Shorts", size: "1080 × 1920px", ratio: "9:16", max: "60s / 15min" },
  { type: "YT thumbnail", size: "1280 × 720px", ratio: "16:9", max: "2 MB" },
];

const PHASES: Phase[] = [
  {
    id: "profile",
    phase: "FÁZA 1",
    title: "Nastavenie profilu",
    accent: "text-blue-400 border-blue-400/30 bg-blue-400/5",
    items: [
      { id: "username", text: "Username: max 30 znakov, lowercase, ľahko hláskované (test: vyslov 3×)" },
      { id: "username_check", text: "Skontroluj dostupnosť: IG + YT + TikTok naraz (konzistentnosť)" },
      { id: "name_field", text: "Name field = '[Meno] | [Niche keyword]' — toto je vyhľadávateľné na IG (max 30 znakov)" },
      { id: "bio_line1", text: "Bio riadok 1: Čo robíš + pre koho (max 40 znakov)" },
      { id: "bio_line2", text: "Bio riadok 2: Čo dostanú (benefit, nie feature)" },
      { id: "bio_line3", text: "Bio riadok 3: Sociálny dôkaz alebo lokácia" },
      { id: "bio_line4", text: "Bio riadok 4: CTA + link (Fanvue / web)" },
      { id: "pfp", text: "Profilovka: tvár 70% kruhu, eye contact, svetlé pozadie, jemný úsmev — test: spoznáš ju na 40px?" },
      { id: "highlight_about", text: "Highlight: ABOUT (kto si, vibe)" },
      { id: "highlight_location", text: "Highlight: [LOKÁCIA] (travel/miesto)" },
      { id: "highlight_bts", text: "Highlight: BTS (behind the scenes tvorby)" },
      { id: "highlight_niche", text: "Highlight: [NICHE] (hlavná téma: beauty/fashion/food)" },
      { id: "highlight_reels", text: "Highlight: REELS (best of reels)" },
      { id: "highlight_covers", text: "Highlight covers: béžové/neutrálne pozadie + čierne ikonky, text v strede 400px zóne" },
    ],
  },
  {
    id: "first_content",
    phase: "FÁZA 2",
    title: "Prvý obsah (Deň 2–7)",
    accent: "text-violet-400 border-violet-400/30 bg-violet-400/5",
    items: [
      { id: "feed_arch", text: "Feed architektúra naplánovaná: 9-postový rytmus (portrait → environment → lifestyle → walking → mirror → BTS → portrait → in-between → cinematic)" },
      { id: "reel1", text: "Reel #1 — Intro reel: walking + close-up + environment, CTA: 'follow for [1 slovo niche]'", action: { label: "Generuj v Growth", href: "/growth" } },
      { id: "reel2", text: "Reel #2 — POV reel: 'POV: [relatable moment]', bez CTA", action: { label: "Generuj v Growth", href: "/growth" } },
      { id: "reel3", text: "Reel #3 — Aesthetic storytelling: 'She [romanticized action]', slow cuts 7–12s, ambient hudba", action: { label: "Generuj v Growth", href: "/growth" } },
      { id: "pin1", text: "Pripnutý post 1: Intro reel (kto si)" },
      { id: "pin2", text: "Pripnutý post 2: Najsilnejší vizuálny reel" },
      { id: "pin3", text: "Pripnutý post 3: Emočný reel (príbeh, voiceover)" },
    ],
  },
  {
    id: "daily",
    phase: "FÁZA 3",
    title: "Denný systém (od Dňa 7+)",
    accent: "text-teal border-teal/30 bg-teal/5",
    items: [
      { id: "daily_output", text: "Minimálny denný výstup nastavený: 2 Reely + 3–7 Stories", action: { label: "Otvoriť Growth", href: "/growth" } },
      { id: "posting_times", text: "Posting časy otestované a fixnuté: 8:00–9:00 (morning) + 18:30–21:00 (prime time)" },
      { id: "stories_morning", text: "Stories šablóna: Ráno = lifestyle moment, Poludnie = BTS/poll, Večer = repost reelu + soft CTA" },
      { id: "stories_repost", text: "Nastavený zvyk: Repost vlastných reelov do Stories (growth hack #1)" },
      { id: "stories_max", text: "Limit: max 7 stories denne" },
    ],
  },
  {
    id: "monitoring",
    phase: "FÁZA 4",
    title: "Content mix monitoring",
    accent: "text-amber border-amber/30 bg-amber/5",
    items: [
      { id: "mix_ratio", text: "Content mix nastavený: 70% aesthetic (luxury, cinematic) + 30% human (BTS, candid)" },
      { id: "pillars", text: "4 content pilliere definované: Soft Luxury + Cinematic Femininity + Creator Life + [Lokácia/World]" },
      { id: "audit_14", text: "Prvý content audit naplánovaný za 14 dní" },
      { id: "watch_gap", text: "Sleduj varovné signály: 5+ dní bez postu / 80%+ aesthetic bez ľudského momentu / rovnaký typ záberov 3× za sebou" },
    ],
  },
  {
    id: "monetization",
    phase: "FÁZA 5",
    title: "Monetizácia (1 000+ followers)",
    accent: "text-accent border-accent/30 bg-accent/5",
    items: [
      { id: "fanvue_account", text: "Fanvue účet vytvorený" },
      { id: "fanvue_kyc", text: "KYC (identity verification) dokončené" },
      { id: "fanvue_link", text: "Link v IG bio na prvom mieste" },
      { id: "fanvue_content", text: "Prvý exkluzívny obsah uploadnutý" },
      { id: "fanvue_stories", text: "Stories CTA nastavené (link sticker → Fanvue)", action: { label: "Publish Queue", href: "/publish" } },
      { id: "broadcast", text: "Broadcast channel vytvorený: 'Inner Circle'" },
    ],
  },
  {
    id: "hashtags",
    phase: "EXTRA",
    title: "Hashtag stratégia",
    accent: "text-muted2 border-border bg-surface",
    items: [
      { id: "ht_count", text: "Počet hashtagov: 5–8 (nie 30)" },
      { id: "ht_broad", text: "2× broad SEO (1M+): napr. #luxurylifestyle #cinematicfilm" },
      { id: "ht_niche", text: "2× niche (100k–500k): napr. #softaesthetic #feminineenergy" },
      { id: "ht_micro", text: "1× micro niche (pod 100k): napr. #marseillelife #slowlivingmovement" },
      { id: "ht_branded", text: "1× branded alebo lokálny" },
      { id: "ht_avoid", text: "Zakázané: #fyp #foryoupage #viral #trending #followme #likeforlike — nikdy nepoužívaj" },
    ],
  },
  {
    id: "audit",
    phase: "AUDIT",
    title: "IG Profile Audit (každých 30 dní)",
    accent: "text-muted2 border-border bg-surface",
    items: [
      { id: "audit_screenshots", text: "3 screenshoty: profil + feed + insights" },
      { id: "audit_claude", text: "Analýza v Claude s audit promptom z knižnice" },
      { id: "audit_top3", text: "Top 3 zmeny identifikované a implementované do 48 hodín" },
      { id: "audit_er_nano", text: "Engagement rate sledovaný: nano účet (pod 10k) → zdravý = 5–8%" },
      { id: "audit_er_micro", text: "Engagement rate sledovaný: mikro (10k–100k) → zdravý = 3–5%" },
      { id: "audit_reach", text: "Reach per reel: cieľ = aspoň 3× počet followers" },
    ],
  },
];

function storageKey(charId: string) {
  return `launch_checklist_${charId}`;
}

function loadChecklist(charId: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(storageKey(charId));
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveChecklist(charId: string, checked: Set<string>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(storageKey(charId), JSON.stringify(Array.from(checked)));
}

function PhaseProgress({ phase, checked }: { phase: Phase; checked: Set<string> }) {
  const done = phase.items.filter((i) => checked.has(i.id)).length;
  const total = phase.items.length;
  const pct = Math.round((done / total) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1 bg-border rounded-full overflow-hidden">
        <div className="h-full bg-accent/60 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[9px] text-muted">{done}/{total}</span>
    </div>
  );
}

export default function LaunchClient({ characters }: { characters: Character[] }) {
  const [charId, setCharId] = useState(characters[0]?.id ?? "");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [openPhases, setOpenPhases] = useState<Set<string>>(new Set(["profile"]));

  useEffect(() => {
    setChecked(loadChecklist(charId));
  }, [charId]);

  const toggle = (itemId: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(itemId) ? next.delete(itemId) : next.add(itemId);
      saveChecklist(charId, next);
      return next;
    });
  };

  const togglePhase = (phaseId: string) => {
    setOpenPhases((prev) => {
      const next = new Set(prev);
      next.has(phaseId) ? next.delete(phaseId) : next.add(phaseId);
      return next;
    });
  };

  const totalItems = PHASES.flatMap((p) => p.items).length;
  const totalDone = PHASES.flatMap((p) => p.items).filter((i) => checked.has(i.id)).length;
  const totalPct = totalItems > 0 ? Math.round((totalDone / totalItems) * 100) : 0;

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-3xl">

      {/* Character selector + overall progress */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        <div className="flex-1">
          <p className="font-mono text-[9px] tracking-widest text-muted uppercase mb-1.5">Charakter</p>
          <select
            value={charId}
            onChange={(e) => setCharId(e.target.value)}
            className="w-full bg-surface border border-border text-ink font-mono text-[12px] px-3 py-2.5 focus:outline-none focus:border-accent"
          >
            {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex-shrink-0">
          <p className="font-mono text-[9px] tracking-widest text-muted uppercase mb-1.5">Celkový progress</p>
          <div className="flex items-center gap-3">
            <div className="w-40 h-2 bg-border rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${totalPct === 100 ? "bg-teal" : "bg-accent/70"}`}
                style={{ width: `${totalPct}%` }}
              />
            </div>
            <span className={`font-mono text-[12px] font-medium ${totalPct === 100 ? "text-teal" : "text-ink"}`}>
              {totalPct}%
            </span>
          </div>
          <p className="font-mono text-[9px] text-muted mt-0.5">{totalDone} / {totalItems} krokov</p>
        </div>
      </div>

      {/* Fáza 0 — Tech specs (no checklist, just reference) */}
      <section className="bg-bg2 border border-border">
        <button
          onClick={() => togglePhase("specs")}
          className="w-full px-6 py-4 border-b border-border bg-bg3 flex items-center justify-between hover:bg-surface transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="font-mono text-[8px] border px-2 py-0.5 uppercase text-muted border-border">FÁZA 0</span>
            <p className="font-mono text-[11px] text-ink font-medium">Technické špecifikácie</p>
          </div>
          <span className="material-symbols-outlined text-[16px] text-muted">
            {openPhases.has("specs") ? "expand_less" : "expand_more"}
          </span>
        </button>

        {openPhases.has("specs") && (
          <div className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    {["Typ obsahu", "Rozmer", "Pomer", "Max"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-mono text-[9px] tracking-widest text-muted uppercase">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TECH_SPECS.map((row, i) => (
                    <tr key={i} className="border-b border-border/40 last:border-0">
                      <td className="px-3 py-2 font-mono text-[11px] text-ink">{row.type}</td>
                      <td className="px-3 py-2 font-mono text-[10px] text-muted2">{row.size}</td>
                      <td className="px-3 py-2 font-mono text-[10px] text-accent">{row.ratio}</td>
                      <td className="px-3 py-2 font-mono text-[10px] text-muted">{row.max}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="font-mono text-[9px] text-amber mt-4 flex items-start gap-1.5">
              <span className="material-symbols-outlined text-[12px] flex-shrink-0 mt-0.5">warning</span>
              IG oreže feed foto na 4:5 automaticky. Vždy exportuj v 4:5 pre feed.
            </p>
          </div>
        )}
      </section>

      {/* Phases 1–7 as checklists */}
      {PHASES.map((phase) => {
        const isOpen = openPhases.has(phase.id);
        const donePct = Math.round((phase.items.filter((i) => checked.has(i.id)).length / phase.items.length) * 100);
        const allDone = donePct === 100;

        return (
          <section key={phase.id} className={`border ${allDone ? "border-teal/30" : "border-border"} bg-bg2`}>
            <button
              onClick={() => togglePhase(phase.id)}
              className="w-full px-6 py-4 border-b border-border bg-bg3 flex items-center justify-between hover:bg-surface transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className={`font-mono text-[8px] border px-2 py-0.5 uppercase ${phase.accent}`}>
                  {phase.phase}
                </span>
                <p className={`font-mono text-[11px] font-medium ${allDone ? "text-teal" : "text-ink"}`}>
                  {phase.title}
                  {allDone && <span className="ml-2 text-teal">✓</span>}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <PhaseProgress phase={phase} checked={checked} />
                <span className="material-symbols-outlined text-[16px] text-muted">
                  {isOpen ? "expand_less" : "expand_more"}
                </span>
              </div>
            </button>

            {isOpen && (
              <div className="divide-y divide-border/40">
                {phase.items.map((item) => {
                  const isDone = checked.has(item.id);
                  return (
                    <div
                      key={item.id}
                      className={`flex items-start gap-3 px-6 py-3 transition-all hover:bg-bg3/40 ${isDone ? "opacity-60" : ""}`}
                    >
                      <button
                        onClick={() => toggle(item.id)}
                        className={`flex-shrink-0 w-4 h-4 border mt-0.5 flex items-center justify-center transition-colors ${
                          isDone ? "border-teal bg-teal" : "border-border hover:border-accent"
                        }`}
                      >
                        {isDone && (
                          <span className="material-symbols-outlined text-[10px] text-bg">check</span>
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`font-mono text-[11px] leading-relaxed ${isDone ? "line-through text-muted" : "text-muted2"}`}>
                          {item.text}
                        </p>
                        {item.action && (
                          <Link
                            href={item.action.href}
                            className="inline-flex items-center gap-1 font-mono text-[9px] text-accent hover:underline mt-1"
                          >
                            <span className="material-symbols-outlined text-[11px]">open_in_new</span>
                            {item.action.label}
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      {/* Feed architecture reference (collapsible) */}
      <section className="bg-bg2 border border-border">
        <button
          onClick={() => togglePhase("feed_arch_ref")}
          className="w-full px-6 py-4 border-b border-border bg-bg3 flex items-center justify-between hover:bg-surface transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="font-mono text-[8px] border px-2 py-0.5 uppercase text-muted border-border">REF</span>
            <p className="font-mono text-[11px] text-ink font-medium">Feed architektúra — rytmus 9 postov</p>
          </div>
          <span className="material-symbols-outlined text-[16px] text-muted">
            {openPhases.has("feed_arch_ref") ? "expand_less" : "expand_more"}
          </span>
        </button>
        {openPhases.has("feed_arch_ref") && (
          <div className="p-6">
            <div className="space-y-1">
              {[
                ["Post 1", "Close-up portrait", "warm, alive"],
                ["Post 2", "Environment shot", "dych, bez osoby"],
                ["Post 3", "Lifestyle moment", "coffee, book, hands"],
                ["Post 4", "Walking shot", "candid, mid-step"],
                ["Post 5", "Mirror shot", "intimate, caught mid-thought"],
                ["Post 6", "BTS moment", "real, messy, relatable"],
                ["Post 7", "Close-up portrait", "iný výraz"],
                ["Post 8", "In-between moment", "distracted, not posing"],
                ["Post 9", "Cinematic environment", "golden hour, sea, street"],
              ].map(([num, type, note], i) => (
                <div key={i} className="flex items-center gap-3 py-1.5 border-b border-border/30 last:border-0">
                  <span className="font-mono text-[9px] text-muted w-10 flex-shrink-0">{num}</span>
                  <span className="font-mono text-[11px] text-ink flex-1">{type}</span>
                  <span className="font-mono text-[9px] text-muted italic">{note}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Conversion funnel reference */}
      <section className="bg-bg2 border border-border">
        <button
          onClick={() => togglePhase("funnel")}
          className="w-full px-6 py-4 border-b border-border bg-bg3 flex items-center justify-between hover:bg-surface transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="font-mono text-[8px] border px-2 py-0.5 uppercase text-accent border-accent/30 bg-accent/5">MONETIZÁCIA</span>
            <p className="font-mono text-[11px] text-ink font-medium">Konverzný funnel</p>
          </div>
          <span className="material-symbols-outlined text-[16px] text-muted">
            {openPhases.has("funnel") ? "expand_less" : "expand_more"}
          </span>
        </button>
        {openPhases.has("funnel") && (
          <div className="p-6">
            <div className="space-y-2">
              {[
                { step: "IG Discovery Reel", note: "reach noví ľudia", accent: "text-blue-400" },
                { step: "→ Follow", note: "záujem o charakter", accent: "text-muted2" },
                { step: "→ Stories (teasery, BTS)", note: "budovanie dôvery", accent: "text-amber" },
                { step: "→ Bio link → Fanvue", note: "konverzia", accent: "text-accent" },
                { step: "→ Subscription / Paid Media", note: "monetizácia", accent: "text-teal" },
              ].map(({ step, note, accent }, i) => (
                <div key={i} className={`flex items-center gap-3 ${i > 0 ? "pl-4" : ""}`}>
                  <span className={`font-mono text-[11px] ${accent}`}>{step}</span>
                  <span className="font-mono text-[9px] text-muted">— {note}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

    </div>
  );
}
