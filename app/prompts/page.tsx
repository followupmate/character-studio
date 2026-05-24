import { supabase } from "@/lib/supabase";
import Sidebar from "@/components/dashboard/Sidebar";
import PromptLibraryClient from "@/components/prompts/PromptLibraryClient";
import ReferenceTemplates from "@/components/prompts/ReferenceTemplates";

export const dynamic = "force-dynamic";

async function getPrompts() {
  const { data } = await supabase
    .from("chs_media")
    .select("id, type, higgsfield_prompt, status, created_at, story_day_id, prompt_doctrine, visual_tone_used, styling_note_used, chs_story_days(location, mood, day_number, character_id, chs_characters(name, id))")
    .not("higgsfield_prompt", "eq", "manual_upload")
    .order("created_at", { ascending: false })
    .limit(200);
  return data ?? [];
}

export default async function PromptsPage() {
  const prompts = await getPrompts();

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 lg:ml-56">
        <div className="sticky top-0 z-40 bg-surface border-b border-border pl-14 pr-4 lg:px-8 h-13 flex items-center justify-between">
          <h1 className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted2">Prompt Knižnica</h1>
          <span className="font-mono text-[10px] text-muted">{prompts.length} promptov</span>
        </div>

        <div className="p-4 lg:p-8">
          <p className="font-mono text-[9px] tracking-[0.15em] text-muted uppercase mb-1">// Higgsfield Prompts</p>
          <h2 className="font-display italic text-[48px] leading-[1.1] text-white mb-8">
            Prompt Library
          </h2>

          <ReferenceTemplates />

          <PromptLibraryClient prompts={prompts as never} />
        </div>
      </main>
    </div>
  );
}
