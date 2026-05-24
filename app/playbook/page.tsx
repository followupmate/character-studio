import Sidebar from "@/components/dashboard/Sidebar";

export const dynamic = "force-dynamic";

const TECH_SPECS = [
  { type: "Feed foto (portrait 4:5)", size: "1080 × 1350px", ratio: "4:5", max: "30 MB" },
  { type: "Feed foto (portrait 3:4)", size: "1080 × 1440px", ratio: "3:4", max: "30 MB" },
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

const HASHTAG_RULES = [
  { label: "Počet hashtagov", value: "5–8 (nie 30)", accent: "text-teal" },
  { label: "Broad SEO (1M+)", value: "2× — napr. #luxurylifestyle #cinematicfilm", accent: "text-blue-400" },
  { label: "Niche (100k–500k)", value: "2× — napr. #softaesthetic #feminineenergy", accent: "text-violet-400" },
  { label: "Micro niche (< 100k)", value: "1× — napr. #marseillelife #slowlivingmovement", accent: "text-amber" },
  { label: "Branded / lokálny", value: "1× — character signature alebo city tag", accent: "text-accent" },
];

const HASHTAG_BANS = [
  "#fyp", "#foryoupage", "#viral", "#trending", "#followme", "#likeforlike",
  "#instagood", "#instadaily", "#photooftheday", "#picoftheday",
];

const ENGAGEMENT_TARGETS = [
  { tier: "Nano (pod 10k)", er: "5–8 %", reach: "3× počet followers per reel" },
  { tier: "Mikro (10k–100k)", er: "3–5 %", reach: "2× počet followers per reel" },
  { tier: "Macro (100k+)", er: "1–3 %", reach: "1× počet followers per reel" },
];

export default function PlaybookPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 lg:ml-56">
        <div className="sticky top-0 z-40 bg-surface border-b border-border pl-14 pr-4 lg:px-8 h-13 flex items-center justify-between">
          <h1 className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted2">Playbook</h1>
          <span className="font-mono text-[10px] text-muted">Reference lookups</span>
        </div>

        <div className="p-4 lg:p-8 space-y-6 max-w-3xl">
          <div className="bg-bg2 border border-border px-5 py-4">
            <p className="font-mono text-[10px] text-muted2 leading-relaxed">
              Statické referencie — technické rozmery, hashtag pravidlá, engagement benchmarky.
              Nie checklist, len lookup.
            </p>
          </div>

          {/* Tech specs */}
          <section className="bg-bg2 border border-border">
            <div className="px-6 py-4 border-b border-border bg-bg3">
              <p className="font-mono text-[11px] text-ink font-medium">Technické špecifikácie</p>
              <p className="font-mono text-[9px] text-muted mt-0.5">IG + YT rozmery a limity</p>
            </div>
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
          </section>

          {/* Hashtag rules */}
          <section className="bg-bg2 border border-border">
            <div className="px-6 py-4 border-b border-border bg-bg3">
              <p className="font-mono text-[11px] text-ink font-medium">Hashtag stratégia</p>
              <p className="font-mono text-[9px] text-muted mt-0.5">5–8 hashtagov, štruktúrované</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                {HASHTAG_RULES.map((rule) => (
                  <div key={rule.label} className="flex items-baseline gap-3 py-1.5 border-b border-border/30 last:border-0">
                    <span className={`font-mono text-[10px] uppercase tracking-wider w-36 flex-shrink-0 ${rule.accent}`}>
                      {rule.label}
                    </span>
                    <span className="font-mono text-[11px] text-muted2">{rule.value}</span>
                  </div>
                ))}
              </div>

              <div className="border border-red-500/20 bg-red-500/5 p-4">
                <p className="font-mono text-[9px] text-red-400 uppercase tracking-wider mb-2">Nikdy nepoužívať</p>
                <div className="flex flex-wrap gap-1.5">
                  {HASHTAG_BANS.map((tag) => (
                    <span key={tag} className="font-mono text-[10px] text-red-400/80 bg-red-500/5 border border-red-500/20 px-2 py-0.5">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Engagement benchmarks */}
          <section className="bg-bg2 border border-border">
            <div className="px-6 py-4 border-b border-border bg-bg3">
              <p className="font-mono text-[11px] text-ink font-medium">Engagement benchmarky</p>
              <p className="font-mono text-[9px] text-muted mt-0.5">Zdravé hodnoty podľa veľkosti účtu</p>
            </div>
            <div className="p-6">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    {["Veľkosť účtu", "Zdravý ER", "Reach per reel"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-mono text-[9px] tracking-widest text-muted uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ENGAGEMENT_TARGETS.map((row) => (
                    <tr key={row.tier} className="border-b border-border/40 last:border-0">
                      <td className="px-3 py-2 font-mono text-[11px] text-ink">{row.tier}</td>
                      <td className="px-3 py-2 font-mono text-[11px] text-teal">{row.er}</td>
                      <td className="px-3 py-2 font-mono text-[10px] text-muted2">{row.reach}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="font-mono text-[9px] text-muted mt-3">
                ER = (likes + komentáre) / followers × 100
              </p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
