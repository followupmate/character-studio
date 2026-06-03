"use client";

import { useEffect, useState } from "react";

type Character = { id: string; name: string; slug: string };

type CheckItem = { id: string; text: string; href?: string };

const FANVUE_SETUP: CheckItem[] = [
  { id: "fanvue_account",   text: "Fanvue účet vytvorený" },
  { id: "fanvue_kyc",       text: "KYC (identity verification) dokončené" },
  { id: "fanvue_link",      text: "Link v IG bio na prvom mieste" },
  { id: "fanvue_content",   text: "Prvý exkluzívny obsah uploadnutý" },
  { id: "fanvue_stories",   text: "Stories CTA nastavené (link sticker → Fanvue)", href: "/publish" },
  { id: "broadcast",        text: "Broadcast channel vytvorený: 'Inner Circle'" },
];

const FUNNEL = [
  { step: "IG Discovery Reel",         note: "reach noví ľudia",         accent: "text-blue-400" },
  { step: "→ Follow",                   note: "záujem o charakter",       accent: "text-muted2" },
  { step: "→ Stories (teasery, BTS)",   note: "budovanie dôvery",         accent: "text-amber" },
  { step: "→ Bio link → Fanvue",        note: "konverzia",                accent: "text-accent" },
  { step: "→ Subscription / Paid Media", note: "monetizácia",              accent: "text-teal" },
];

function storageKey(charId: string) {
  return `monetization_checklist_${charId}`;
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

export default function MonetizationClient({ characters }: { characters: Character[] }) {
  const [charId, setCharId] = useState(characters[0]?.id ?? "");
  const [checked, setChecked] = useState<Set<string>>(new Set());

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

  const total = FANVUE_SETUP.length;
  const done = FANVUE_SETUP.filter((i) => checked.has(i.id)).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-3xl">

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
          <p className="font-mono text-[9px] tracking-widest text-muted uppercase mb-1.5">Setup progress</p>
          <div className="flex items-center gap-3">
            <div className="w-40 h-2 bg-border rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${pct === 100 ? "bg-teal" : "bg-accent/70"}`} style={{ width: `${pct}%` }} />
            </div>
            <span className={`font-mono text-[12px] font-medium ${pct === 100 ? "text-teal" : "text-ink"}`}>{pct}%</span>
          </div>
          <p className="font-mono text-[9px] text-muted mt-0.5">{done} / {total} krokov</p>
        </div>
      </div>

      <div className="bg-amber/5 border border-amber/20 px-5 py-4">
        <p className="font-mono text-[10px] text-amber leading-relaxed">
          <span className="material-symbols-outlined text-[12px] align-middle mr-1">lock</span>
          Monetizáciu spúšťaj až po dosiahnutí <span className="text-ink">1000+ followers</span>. Skoršie spustenie zníži reach (algoritmus deprioritizuje externé linky pri malých účtoch).
        </p>
      </div>

      {/* Fanvue setup */}
      <section className="bg-bg2 border border-border">
        <div className="px-6 py-4 border-b border-border bg-bg3 flex items-center gap-3">
          <span className="font-mono text-[8px] border px-2 py-0.5 uppercase text-accent border-accent/30 bg-accent/5">FANVUE</span>
          <p className="font-mono text-[11px] text-ink font-medium">Setup checklist</p>
        </div>
        <div className="divide-y divide-border/40">
          {FANVUE_SETUP.map((item) => {
            const isDone = checked.has(item.id);
            return (
              <div key={item.id} className={`flex items-start gap-3 px-6 py-3 transition-all hover:bg-bg3/40 ${isDone ? "opacity-60" : ""}`}>
                <button
                  onClick={() => toggle(item.id)}
                  className={`flex-shrink-0 w-4 h-4 border mt-0.5 flex items-center justify-center transition-colors ${
                    isDone ? "border-teal bg-teal" : "border-border hover:border-accent"
                  }`}
                >
                  {isDone && <span className="material-symbols-outlined text-[10px] text-bg">check</span>}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`font-mono text-[11px] leading-relaxed ${isDone ? "line-through text-muted" : "text-muted2"}`}>
                    {item.text}
                  </p>
                  {item.href && (
                    <a href={item.href} className="inline-flex items-center gap-1 font-mono text-[9px] text-accent hover:underline mt-1">
                      <span className="material-symbols-outlined text-[11px]">open_in_new</span>
                      {item.href}
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Conversion funnel */}
      <section className="bg-bg2 border border-border">
        <div className="px-6 py-4 border-b border-border bg-bg3">
          <p className="font-mono text-[11px] text-ink font-medium">Konverzný funnel</p>
          <p className="font-mono text-[9px] text-muted mt-0.5">Cesta od discovery k subscription</p>
        </div>
        <div className="p-6 space-y-2">
          {FUNNEL.map(({ step, note, accent }, i) => (
            <div key={i} className={`flex items-center gap-3 ${i > 0 ? "pl-4" : ""}`}>
              <span className={`font-mono text-[11px] ${accent}`}>{step}</span>
              <span className="font-mono text-[9px] text-muted">— {note}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
