import { supabase } from "@/lib/supabase";
import Sidebar from "@/components/dashboard/Sidebar";
import ReviewClient from "./ReviewClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getData() {
  const today = new Date().toISOString().split("T")[0];
  const in14Days = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const { data: characters } = await supabase
    .from("chs_characters")
    .select("id, name, photo_url, posting_time, platforms")
    .eq("is_active", true)
    .order("created_at");

  if (!characters || characters.length === 0) return { batches: [], today };

  const { data: plans } = await supabase
    .from("chs_daily_plans")
    .select("id, character_id, story_day_id, date, batch_status")
    .gte("date", today)
    .lte("date", in14Days)
    .in("batch_status", ["ready", "partial_failed"])
    .order("date", { ascending: true });

  if (!plans || plans.length === 0) return { batches: [], today };

  const storyDayIds = plans.map((p) => p.story_day_id).filter(Boolean);
  const planIds = plans.map((p) => p.id);

  const [storyDaysRes, mediaRes, postsRes] = await Promise.all([
    supabase
      .from("chs_story_days")
      .select("id, character_id, date, ig_caption, hashtags, narrative, location, mood, tier, arc_position, emotional_beat, next_hint")
      .in("id", storyDayIds),
    supabase
      .from("chs_media")
      .select("id, batch_id, slot, type, channel, sequence_index, media_url, thumbnail_url, generation_status, hook_text, shot_archetype")
      .in("batch_id", planIds)
      .order("sequence_index"),
    supabase
      .from("chs_posts")
      .select("id, story_day_id, post_type, status")
      .in("story_day_id", storyDayIds),
  ]);

  const storyDays = storyDaysRes.data ?? [];
  const allMedia = mediaRes.data ?? [];
  const existingPosts = postsRes.data ?? [];

  const batches = plans
    .map((plan) => {
      const character = characters.find((c) => c.id === plan.character_id);
      if (!character) return null;

      const storyDay = storyDays.find((s) => s.id === plan.story_day_id);
      if (!storyDay) return null;

      const media = allMedia.filter((m) => m.batch_id === plan.id);
      const posts = existingPosts.filter((p) => p.story_day_id === storyDay.id);

      return { plan, character, storyDay, media, existingPosts: posts };
    })
    .filter(Boolean);

  return { batches, today };
}

export default async function ReviewPage() {
  const { batches, today } = await getData();

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar />
      <main className="flex-1 lg:pl-56">
        <ReviewClient batches={batches as any} today={today} />
      </main>
    </div>
  );
}
