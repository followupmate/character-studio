import Sidebar from "@/components/dashboard/Sidebar";

export const dynamic = "force-dynamic";

const tables = [
  {
    name: "chs_characters",
    icon: "◈",
    description: "Charaktery, Soul ID, backstory, platformy",
    columns: [
      { name: "id", type: "uuid", note: "PK" },
      { name: "name", type: "text", note: "" },
      { name: "slug", type: "text", note: "unique" },
      { name: "soul_id", type: "text", note: "nullable · Higgsfield" },
      { name: "visual_brief", type: "text", note: "" },
      { name: "backstory", type: "text", note: "" },
      { name: "personality", type: "jsonb", note: "" },
      { name: "platforms", type: "text[]", note: "instagram | youtube | tiktok" },
      { name: "posting_time", type: "time", note: "" },
      { name: "is_active", type: "boolean", note: "default true" },
      { name: "created_at", type: "timestamptz", note: "default now()" },
    ],
  },
  {
    name: "chs_story_days",
    icon: "◎",
    description: "Denné príbehy, lokácia, nálada, arc pozícia",
    columns: [
      { name: "id", type: "uuid", note: "PK" },
      { name: "character_id", type: "uuid", note: "FK → chs_characters" },
      { name: "day_number", type: "integer", note: "" },
      { name: "date", type: "date", note: "" },
      { name: "location", type: "text", note: "" },
      { name: "mood", type: "text", note: "" },
      { name: "narrative", type: "text", note: "" },
      { name: "arc_position", type: "text", note: "opening | rising | peak | turning | falling | quiet" },
      { name: "next_hint", type: "text", note: "nullable" },
      { name: "ig_caption", type: "text", note: "nullable" },
      { name: "hashtags", type: "text[]", note: "nullable" },
      { name: "created_at", type: "timestamptz", note: "default now()" },
    ],
  },
  {
    name: "chs_media",
    icon: "◧",
    description: "Foto/video prompty, Higgsfield job ID, status",
    columns: [
      { name: "id", type: "uuid", note: "PK" },
      { name: "story_day_id", type: "uuid", note: "FK → chs_story_days" },
      { name: "type", type: "text", note: "photo | video" },
      { name: "higgsfield_prompt", type: "text", note: "" },
      { name: "higgsfield_job_id", type: "text", note: "nullable" },
      { name: "media_url", type: "text", note: "nullable" },
      { name: "thumbnail_url", type: "text", note: "nullable" },
      { name: "status", type: "text", note: "pending | generating | ready | posted | failed" },
      { name: "created_at", type: "timestamptz", note: "default now()" },
    ],
  },
  {
    name: "chs_posts",
    icon: "◪",
    description: "Posting log, platformy, engagement",
    columns: [
      { name: "id", type: "uuid", note: "PK" },
      { name: "media_id", type: "uuid", note: "FK → chs_media" },
      { name: "platform", type: "text", note: "instagram | youtube | tiktok" },
      { name: "platform_post_id", type: "text", note: "nullable" },
      { name: "scheduled_at", type: "timestamptz", note: "nullable" },
      { name: "posted_at", type: "timestamptz", note: "nullable" },
      { name: "status", type: "text", note: "scheduled | posted | failed" },
      { name: "engagement", type: "jsonb", note: "likes, views, …" },
      { name: "created_at", type: "timestamptz", note: "default now()" },
    ],
  },
];

export default function SchemaPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 lg:ml-56">
        {/* Topbar */}
        <div className="sticky top-0 z-40 bg-bg2 border-b border-border pl-14 pr-4 lg:px-8 h-13 flex items-center justify-between">
          <h1 className="text-white font-medium text-sm tracking-wide">DB Schéma</h1>
          <a
            href={process.env.NEXT_PUBLIC_SUPABASE_URL?.replace("/rest/v1", "").replace("https://", "https://app.supabase.com/project/") ?? "https://supabase.com"}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[10px] text-accent hover:text-blue-300 transition-colors"
          >
            → Supabase Dashboard ↗
          </a>
        </div>

        <div className="p-4 lg:p-8">
          <p className="font-mono text-[9px] tracking-widest text-muted uppercase mb-2">// Databáza</p>
          <h2 className="text-2xl font-medium text-white mb-1">DB Schéma</h2>
          <p className="text-sm text-muted2 mb-8">
            Supabase · prefix <span className="font-mono text-accent">chs_</span> · 4 tabuľky
          </p>

          <div className="grid grid-cols-2 gap-5">
            {tables.map((table) => (
              <div key={table.name} className="bg-bg2 border border-border rounded-md overflow-hidden">
                {/* Table header */}
                <div className="bg-bg3 px-5 py-4 border-b border-border">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-muted text-sm">{table.icon}</span>
                    <span className="font-mono text-sm text-accent">{table.name}</span>
                  </div>
                  <p className="font-mono text-[9px] text-muted">{table.description}</p>
                </div>

                {/* Columns */}
                <div className="divide-y divide-border">
                  {table.columns.map((col) => (
                    <div key={col.name} className="flex items-baseline gap-3 px-5 py-2.5">
                      <span className="font-mono text-[11px] text-ink w-36 flex-shrink-0">{col.name}</span>
                      <span className="font-mono text-[10px] text-teal w-28 flex-shrink-0">{col.type}</span>
                      {col.note && (
                        <span className="font-mono text-[9px] text-muted italic truncate">{col.note}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Relations */}
          <div className="mt-6 bg-bg2 border border-border rounded-md p-5">
            <p className="font-mono text-[9px] text-muted tracking-widest uppercase mb-3">// Relácie</p>
            <div className="font-mono text-[10px] text-muted2 space-y-1.5">
              <div>
                <span className="text-accent">chs_characters</span>
                <span className="text-muted mx-2">→</span>
                <span className="text-teal">chs_story_days</span>
                <span className="text-muted ml-2">(character_id)</span>
              </div>
              <div>
                <span className="text-teal">chs_story_days</span>
                <span className="text-muted mx-2">→</span>
                <span className="text-amber">chs_media</span>
                <span className="text-muted ml-2">(story_day_id)</span>
              </div>
              <div>
                <span className="text-amber">chs_media</span>
                <span className="text-muted mx-2">→</span>
                <span className="text-muted2">chs_posts</span>
                <span className="text-muted ml-2">(media_id)</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
