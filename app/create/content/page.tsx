"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/dashboard/Sidebar";
import StepProgress from "@/components/ui/StepProgress";
import { CharacterDNA } from "@/lib/archetypes";
import { contentData, ArchetypeContent, ContentScript } from "@/lib/content-data";

const TABS = ["TikTok", "Instagram", "X/Twitter", "Reels Scripts", "Content Pillars"] as const;
type Tab = typeof TABS[number];

const fallbackContent: ArchetypeContent = {
  tiktokHooks: [], igCaptions: [], tweets: [], scripts: [], pillars: [],
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button onClick={copy}
      className="flex-shrink-0 font-mono text-[8px] border border-border2 text-muted2 px-2 py-0.5 rounded hover:text-ink hover:border-border transition-colors">
      {copied ? "✓" : "Kopírovať"}
    </button>
  );
}

function HookCard({ text }: { text: string }) {
  return (
    <div className="bg-bg2 border border-border rounded-md p-4 flex items-start justify-between gap-3">
      <p className="text-[12.5px] text-ink leading-relaxed flex-1">{text}</p>
      <CopyButton text={text} />
    </div>
  );
}

function ScriptCard({ script }: { script: ContentScript }) {
  const full = [
    script.hook,
    script.type === "points" && script.points
      ? script.points.map((p, i) => `${i + 1}. ${p}`).join("\n")
      : script.body,
    script.cta ?? "",
  ].filter(Boolean).join("\n\n");

  return (
    <div className="bg-bg2 border border-border rounded-md p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-[9px] text-muted uppercase tracking-widest">{script.type}</p>
        <CopyButton text={full} />
      </div>
      <p className="text-white font-medium text-sm">{script.title}</p>
      <div className="space-y-2 font-mono text-[11px] text-muted2 leading-relaxed">
        <p className="text-ink italic">{script.hook}</p>
        {script.type === "points" && script.points ? (
          <ol className="space-y-1 list-none">
            {script.points.map((p, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-accent">{i + 1}.</span>
                <span>{p}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="whitespace-pre-line">{script.body}</p>
        )}
        {script.cta && (
          <p className="text-teal border-l border-teal/30 pl-3 mt-2">{script.cta}</p>
        )}
      </div>
    </div>
  );
}

export default function ContentPage() {
  const router = useRouter();
  const [dna, setDna] = useState<CharacterDNA | null>(null);
  const [tab, setTab] = useState<Tab>("TikTok");

  useEffect(() => {
    try {
      const raw = localStorage.getItem("character_dna");
      if (raw) setDna(JSON.parse(raw));
    } catch {}
  }, []);

  const content = dna ? (contentData[dna.id] ?? fallbackContent) : fallbackContent;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 lg:ml-56">
        {/* Topbar */}
        <div className="sticky top-0 z-40 bg-bg2 border-b border-border pl-14 pr-4 lg:px-8 h-13 flex items-center justify-between">
          <h1 className="text-white font-medium text-sm tracking-wide">Content Engine</h1>
          {dna && (
            <span className="font-mono text-[8px] bg-accent/10 border border-accent/20 text-accent px-2 py-0.5 tracking-wider">
              {dna.name}
            </span>
          )}
        </div>

        <div className="p-4 lg:p-8">
          <StepProgress current={6} total={8} label="Content Engine" />
          <p className="font-mono text-[9px] tracking-widest text-muted uppercase mb-2">// Content Engine</p>
          <h2 className="text-2xl font-medium text-white mb-8">
            Obsah ktorý{" "}
            <span className="italic text-muted2">rezonuje</span>
          </h2>

          {/* Tabs */}
          <div className="flex border-b border-border mb-6 gap-0">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`font-mono text-[10px] px-4 py-3 transition-colors border-b-2 -mb-px ${
                  tab === t
                    ? "border-accent text-accent"
                    : "border-transparent text-muted2 hover:text-ink"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="space-y-3">
            {tab === "TikTok" && (
              <>
                <p className="font-mono text-[9px] text-muted uppercase tracking-widest mb-4">
                  // {content.tiktokHooks.length} hook{content.tiktokHooks.length !== 1 ? "s" : ""}
                </p>
                {content.tiktokHooks.map((h, i) => <HookCard key={i} text={h} />)}
              </>
            )}

            {tab === "Instagram" && (
              <>
                <p className="font-mono text-[9px] text-muted uppercase tracking-widest mb-4">// Captions</p>
                {content.igCaptions.map((c, i) => <HookCard key={i} text={c} />)}
              </>
            )}

            {tab === "X/Twitter" && (
              <>
                <p className="font-mono text-[9px] text-muted uppercase tracking-widest mb-4">// Posts</p>
                {content.tweets.map((t, i) => <HookCard key={i} text={t} />)}
              </>
            )}

            {tab === "Reels Scripts" && (
              <>
                <p className="font-mono text-[9px] text-muted uppercase tracking-widest mb-4">// Scripts</p>
                <div className="grid grid-cols-1 gap-4">
                  {content.scripts.map((s, i) => <ScriptCard key={i} script={s} />)}
                </div>
              </>
            )}

            {tab === "Content Pillars" && (
              <>
                <p className="font-mono text-[9px] text-muted uppercase tracking-widest mb-4">// Pillars</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {content.pillars.map((p, i) => (
                    <div key={i} className="bg-bg2 border border-border rounded-md p-5">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-white font-medium text-sm">{p.name}</p>
                        <span className="font-mono text-[8px] border border-teal/20 text-teal px-2 py-0.5 rounded-sm">
                          {p.frequency}
                        </span>
                      </div>
                      <ul className="space-y-1.5">
                        {p.ideas.map((idea, j) => (
                          <li key={j} className="flex items-start gap-2 text-[11.5px] text-muted2">
                            <span className="text-accent mt-0.5">·</span>
                            {idea}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </>
            )}

            {!dna && (
              <div className="bg-bg2 border border-border border-dashed rounded-md p-8 text-center">
                <p className="text-white font-medium mb-2">Chýba Character DNA</p>
                <p className="text-sm text-muted mb-4">Najprv vyplň DNA profil.</p>
                <button onClick={() => router.push("/create/dna")}
                  className="font-mono text-[10px] bg-accent text-white px-4 py-2 rounded hover:bg-blue-400 transition-colors">
                  → Vyplniť DNA
                </button>
              </div>
            )}
          </div>

          {/* Continue */}
          <div className="mt-8 pt-6 border-t border-border flex items-center gap-3">
            <button
              onClick={() => router.push("/create/lore")}
              className="font-mono text-[11px] border border-border2 text-muted2 px-5 py-2.5 rounded hover:text-ink hover:border-border transition-colors"
            >
              ← Späť
            </button>
            <button onClick={() => router.push("/create/social")}
              className="font-mono text-[11px] bg-accent text-white px-5 py-2.5 rounded hover:bg-blue-400 transition-colors">
              Pokračovať →
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
