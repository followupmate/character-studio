import Sidebar from "@/components/dashboard/Sidebar";

export const dynamic = "force-dynamic";

const steps = [
  {
    n: 1,
    title: "Supabase migrácia",
    detail: "Otvor Supabase Dashboard → SQL Editor → skopíruj obsah supabase/migration.sql → Run. Vytvorí 4 tabuľky s prefixom chs_.",
    code: "supabase/migration.sql",
  },
  {
    n: 2,
    title: "Environment variables",
    detail: "Skopíruj .env.local.example → .env.local a vyplň ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY a APP_URL.",
    code: "cp .env.local.example .env.local",
  },
  {
    n: 3,
    title: "Inštalácia a spustenie",
    detail: "Nainštaluj závislosti a spusti development server na http://localhost:3000.",
    code: "npm install && npm run dev",
  },
  {
    n: 4,
    title: "Higgsfield Soul ID",
    detail: "Získaj Soul ID z Higgsfield platformy pre každý charakter a vlož ho do databázy cez SQL príkaz.",
    code: "UPDATE chs_characters SET soul_id = 'tvoje-soul-id' WHERE slug = 'vivienne';",
  },
  {
    n: 5,
    title: "Deploy na Vercel",
    detail: "Nasaď aplikáciu na Vercel. Vercel automaticky detekuje Next.js konfiguráciu.",
    code: "npx vercel --prod",
  },
  {
    n: 6,
    title: "Vercel environment variables",
    detail: "V Vercel dashboarde: Settings → Environment Variables → pridaj rovnaké premenné ako v .env.local. Nutné pre produkciu.",
    code: null,
  },
  {
    n: 7,
    title: "Vercel cron jobs",
    detail: "Cron jobs sa aktivujú automaticky z vercel.json. 06:00 UTC generuje príbehy, 10:00 UTC postuje médiá.",
    code: null,
  },
  {
    n: 8,
    title: "Pridanie nového charakteru",
    detail: "Nový charakter pridaj cez SQL INSERT do chs_characters. Nastav name, slug, visual_brief, backstory a platforms.",
    code: "INSERT INTO chs_characters (name, slug, visual_brief, backstory, platforms)\nVALUES ('Marcus', 'marcus', '...', '...', '{instagram}');",
  },
];

export default function SetupPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-56">
        {/* Topbar */}
        <div className="sticky top-0 z-40 bg-bg2 border-b border-border px-8 h-13 flex items-center justify-between">
          <h1 className="text-white font-medium text-sm tracking-wide">Setup</h1>
          <span className="font-mono text-[10px] text-muted">{steps.length} krokov</span>
        </div>

        <div className="p-8">
          <p className="font-mono text-[9px] tracking-widest text-muted uppercase mb-2">// Inštalácia</p>
          <h2 className="text-2xl font-medium text-white mb-1">Setup checklist</h2>
          <p className="text-sm text-muted2 mb-8">
            Postupuj krok po kroku. Stack: Next.js · Supabase · Claude API · Higgsfield · Vercel.
          </p>

          <div className="space-y-3 max-w-2xl">
            {steps.map((step) => (
              <div key={step.n} className="bg-bg2 border border-border rounded-md overflow-hidden">
                {/* Step header */}
                <div className="flex items-start gap-4 px-5 py-4">
                  {/* Checkmark circle */}
                  <div className="flex-shrink-0 w-7 h-7 rounded-full border-2 border-teal/40 bg-teal/5 flex items-center justify-center mt-0.5">
                    <span className="text-teal text-[11px] font-mono font-bold">{step.n}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm font-medium mb-1">{step.title}</div>
                    <p className="text-[12px] text-muted2 leading-relaxed">{step.detail}</p>

                    {step.code && (
                      <pre className="mt-3 bg-bg3 border border-border rounded px-3 py-2.5 font-mono text-[10px] text-teal leading-relaxed whitespace-pre-wrap break-all">
                        {step.code}
                      </pre>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer note */}
          <div className="mt-8 max-w-2xl bg-bg2 border border-border rounded-md px-5 py-4">
            <p className="font-mono text-[9px] text-muted tracking-widest uppercase mb-2">// Docs</p>
            <div className="font-mono text-[10px] text-muted2 space-y-1">
              <div>
                API routes:{" "}
                <span className="text-accent">/api/characters/story</span>
                <span className="text-muted mx-1.5">·</span>
                <span className="text-accent">/api/characters/prompts</span>
                <span className="text-muted mx-1.5">·</span>
                <span className="text-accent">/api/characters/publish</span>
              </div>
              <div className="text-muted">DB prefix: chs_ · 4 tabuľky</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
