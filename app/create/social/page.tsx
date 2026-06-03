"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/dashboard/Sidebar";
import StepProgress from "@/components/ui/StepProgress";
import { CharacterDNA } from "@/lib/archetypes";
import { contentData, paletteToHex } from "@/lib/content-data";

const TABS = ["Instagram", "TikTok", "X/Twitter"] as const;
type Tab = typeof TABS[number];

function getTileGradient(palette: string[], index: number): string {
  const hex = palette.map((c) => paletteToHex[c] ?? "#1c2430");
  if (hex.length === 0) return "linear-gradient(135deg, #131920, #1c2430)";
  const a = hex[index % hex.length];
  const b = hex[(index + 2) % hex.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

function getHandle(name: string): string {
  return "@" + name.toLowerCase().replace(/\s+/g, ".").replace(/[^a-z.]/g, "");
}

function getInitials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function Avatar({ name, size = "lg" }: { name: string; size?: "lg" | "sm" }) {
  const cls = size === "lg" ? "w-16 h-16 text-lg" : "w-10 h-10 text-sm";
  return (
    <div className={`${cls} rounded-full bg-bg3 border border-border2 flex items-center justify-center font-mono font-bold text-ink flex-shrink-0`}>
      {getInitials(name) || "?"}
    </div>
  );
}

export default function SocialPage() {
  const router = useRouter();
  const [dna, setDna] = useState<CharacterDNA | null>(null);
  const [tab, setTab] = useState<Tab>("Instagram");
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("character_dna");
      if (raw) setDna(JSON.parse(raw));
    } catch {}
  }, []);

  function downloadDna() {
    const raw = localStorage.getItem("character_dna");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as CharacterDNA;
      const blob = new Blob([JSON.stringify(parsed, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${parsed.name.replace(/\s+/g, "_")}_DNA.json`;
      a.click();
      URL.revokeObjectURL(url);
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 2000);
    } catch {}
  }

  const content = dna ? (contentData[dna.id] ?? { tiktokHooks: [], igCaptions: [], tweets: [], scripts: [], pillars: [] }) : null;
  const handle = dna ? getHandle(dna.name) : "@handle";
  const bio = dna
    ? `${dna.personality.signaturePhrases[0] ?? ""} · ${dna.identity.niche.split(",")[0] ?? ""}`
    : "";

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 lg:ml-56">
        {/* Topbar */}
        <div className="sticky top-0 z-40 bg-bg2 border-b border-border pl-14 pr-4 lg:px-8 h-13 flex items-center">
          <h1 className="text-white font-medium text-sm tracking-wide">Social Preview</h1>
        </div>

        <div className="p-4 lg:p-8">
          <StepProgress current={7} total={8} label="Social Preview" />
          <p className="font-mono text-[9px] tracking-widest text-muted uppercase mb-2">// Social Preview</p>
          <h2 className="text-2xl font-medium text-white mb-8">
            Ako bude vyzerať{" "}
            <span className="italic text-muted2">na sociálnych sieťach</span>
          </h2>

          {!dna ? (
            <div className="bg-bg2 border border-border border-dashed rounded-md p-8 text-center">
              <p className="text-white font-medium mb-2">Chýba Character DNA</p>
              <p className="text-sm text-muted">Najprv vyplň DNA profil na /create/dna</p>
            </div>
          ) : (
            <>
              {/* Tabs */}
              <div className="flex border-b border-border mb-8 gap-0">
                {TABS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`font-mono text-[10px] px-5 py-3 transition-colors border-b-2 -mb-px ${
                      tab === t
                        ? "border-accent text-accent"
                        : "border-transparent text-muted2 hover:text-ink"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {/* ── Instagram ── */}
              {tab === "Instagram" && (
                <div className="max-w-sm">
                  {/* Profile header */}
                  <div className="bg-bg2 border border-border rounded-md p-5 mb-4">
                    <div className="flex items-center gap-4 mb-4">
                      <Avatar name={dna.name} size="lg" />
                      <div className="flex-1">
                        <p className="text-white font-semibold text-sm">{dna.name}</p>
                        <p className="font-mono text-[10px] text-muted">{handle}</p>
                      </div>
                    </div>
                    <div className="flex gap-6 mb-3 text-center">
                      {[["124", "Posts"], ["10.4K", "Followers"], ["892", "Following"]].map(([val, lbl]) => (
                        <div key={lbl}>
                          <p className="text-white font-semibold text-sm">{val}</p>
                          <p className="font-mono text-[9px] text-muted">{lbl}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11.5px] text-ink leading-relaxed mb-3">{bio}</p>
                    {/* Highlights */}
                    <div className="flex gap-3">
                      {dna.content.pillars.slice(0, 4).map((pillar, i) => (
                        <div key={i} className="flex flex-col items-center gap-1">
                          <div className="w-10 h-10 rounded-full border-2 border-border2 bg-bg3 flex items-center justify-center text-base">
                            {["✦", "◎", "◈", "◐"][i]}
                          </div>
                          <p className="font-mono text-[7px] text-muted text-center w-12 truncate">{pillar}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 3×3 grid */}
                  <div className="grid grid-cols-3 gap-0.5 mb-3">
                    {Array.from({ length: 9 }, (_, i) => (
                      <div
                        key={i}
                        style={{ background: getTileGradient(dna.visual.colorPalette, i) }}
                        className="aspect-square"
                      />
                    ))}
                  </div>
                  <p className="font-mono text-[9px] text-muted text-center">
                    Prvých 9 postov definuje estetiku profilu
                  </p>
                </div>
              )}

              {/* ── TikTok ── */}
              {tab === "TikTok" && (
                <div className="max-w-sm">
                  {/* Profile header */}
                  <div className="bg-bg2 border border-border rounded-md p-5 mb-4">
                    <div className="flex items-center gap-4 mb-3">
                      <Avatar name={dna.name} size="lg" />
                      <div>
                        <p className="text-white font-semibold text-sm">{dna.name}</p>
                        <p className="font-mono text-[10px] text-muted">{handle}</p>
                      </div>
                    </div>
                    <div className="flex gap-6 mb-3 text-center">
                      {[["2.1M", "Likes"], ["84.3K", "Followers"], ["312", "Following"]].map(([val, lbl]) => (
                        <div key={lbl}>
                          <p className="text-white font-semibold text-sm">{val}</p>
                          <p className="font-mono text-[9px] text-muted">{lbl}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11.5px] text-ink leading-relaxed">
                      {dna.personality.signaturePhrases[0] ?? ""}
                    </p>
                  </div>

                  {/* Video hook cards */}
                  <div className="space-y-3">
                    {(content?.tiktokHooks ?? []).slice(0, 5).map((hook, i) => (
                      <div key={i} className="bg-bg2 border border-border rounded-md p-4 flex items-center gap-4">
                        <div
                          style={{ background: getTileGradient(dna.visual.colorPalette, i) }}
                          className="w-12 h-16 rounded flex-shrink-0 flex items-center justify-center"
                        >
                          <span className="text-white text-lg">▶</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] text-ink leading-snug mb-1 line-clamp-2">{hook}</p>
                          <p className="font-mono text-[9px] text-muted">
                            {(Math.floor(Math.random() * 900) + 100).toFixed(1)}K views
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── X/Twitter ── */}
              {tab === "X/Twitter" && (
                <div className="max-w-lg">
                  {/* Profile header */}
                  <div className="bg-bg2 border border-border rounded-md p-5 mb-4">
                    <div className="flex items-center gap-4 mb-3">
                      <Avatar name={dna.name} size="lg" />
                      <div>
                        <p className="text-white font-semibold text-sm">{dna.name}</p>
                        <p className="font-mono text-[10px] text-muted">{handle}</p>
                      </div>
                    </div>
                    <p className="text-[12px] text-ink leading-relaxed mb-3">{bio}</p>
                    <div className="flex gap-5 font-mono text-[10px] text-muted">
                      <span><span className="text-ink font-medium">1.2K</span> Following</span>
                      <span><span className="text-ink font-medium">28.4K</span> Followers</span>
                    </div>
                  </div>

                  {/* Tweet cards */}
                  <div className="space-y-3">
                    {(content?.tweets ?? []).map((tweet, i) => (
                      <div key={i} className="bg-bg2 border border-border rounded-md p-4">
                        <div className="flex items-center gap-3 mb-3">
                          <Avatar name={dna.name} size="sm" />
                          <div>
                            <p className="text-white text-sm font-medium">{dna.name}</p>
                            <p className="font-mono text-[9px] text-muted">{handle}</p>
                          </div>
                        </div>
                        <p className="text-[13px] text-ink leading-relaxed mb-3">{tweet}</p>
                        <div className="flex gap-6 font-mono text-[9px] text-muted">
                          <span>♡ {Math.floor(Math.random() * 900) + 100}</span>
                          <span>↺ {Math.floor(Math.random() * 200) + 20}</span>
                          <span>↗ {Math.floor(Math.random() * 50) + 5}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Bottom nav */}
          <div className="mt-8 pt-6 border-t border-border flex items-center gap-3">
            <button
              onClick={() => router.push("/create/content")}
              className="font-mono text-[11px] border border-border2 text-muted2 px-5 py-2.5 rounded hover:text-ink hover:border-border transition-colors"
            >
              ← Späť
            </button>
            <button
              onClick={() => router.push("/create/launch")}
              className="font-mono text-[11px] bg-accent text-white px-5 py-2.5 rounded hover:bg-blue-400 transition-colors"
            >
              Spustiť charakter →
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
