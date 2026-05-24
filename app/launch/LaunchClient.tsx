"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Character = { id: string; name: string; slug: string };

type CheckItem = { id: string; text: string; action?: { label: string; href: string } };
type Phase = {
  id: string;
  phase: string;
  title: string;
  accent: string;
  items: CheckItem[];
};

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
      { id: "highlight_niche", text: "Highlight: [NICHE] (hlavná téma)" },
      { id: "highlight_reels", text: "Highlight: REELS (best of reels)" },
      { id: "highlight_covers", text: "Highlight covers: konzistentné pozadie + jednoduché ikonky, text v strede 400px zóne" },
    ],
  },
  {
    id: "first_content",
    phase: "FÁZA 2",
    title: "Prvý obsah (Deň 2–7)",
    accent: "text-violet-400 border-violet-400/30 bg-violet-400/5",
    items: [
      { id: "first_batches", text: "3 dni dennej generácie spustené — máš aspoň 21 assetov v banke", action: { label: "Otvoriť dnešný deň", href: "/today" } },
      { id: "pick_pinned", text: "Vyber 3 najsilnejšie posty z banky ako pripnuté (pinned)" },
      { id: "pin_strongest_visual", text: "Pripnutý #1: najsilnejší vizuálny moment (carousel alebo emotional close)" },
      { id: "pin_intro_reel", text: "Pripnutý #2: introdukčný reel — predstaví charakter + miesto", action: { label: "Generovať reel brief", href: "/growth" } },
      { id: "pin_emotional", text: "Pripnutý #3: emočne najsilnejší obsah — to čo by si zanechal divákovi ako prvý dojem" },
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
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      saveChecklist(charId, next);
      return next;
    });
  };

  const togglePhase = (phaseId: string) => {
    setOpenPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phaseId)) next.delete(phaseId);
      else next.add(phaseId);
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
          <p className="font-mono text-[9px] tracking-widest text-muted uppercase mb-1.5">Launch progress</p>
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

      {/* Intro card */}
      <div className="bg-bg2 border border-border px-5 py-4">
        <p className="font-mono text-[10px] text-muted2 leading-relaxed">
          Tu je <span className="text-ink">jednorazový launch checklist</span> — profile setup + výber prvých pinned postov.
          Denné prevádzkové veci (content mix, audit, hashtag stratégia, tech specs) sú v{" "}
          <Link href="/playbook" className="text-accent hover:underline">/playbook</Link>.{" "}
          Audit prompt template je v{" "}
          <Link href="/prompts" className="text-accent hover:underline">/prompts</Link>.{" "}
          Monetizácia (gated 1000+ followers) je v{" "}
          <Link href="/monetization" className="text-accent hover:underline">/monetization</Link>.
        </p>
      </div>

      {/* Phases */}
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

    </div>
  );
}
