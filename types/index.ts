export type CharacterPlatform = "instagram" | "youtube" | "tiktok";
export type MediaType = "photo" | "video";
export type MediaStatus = "pending" | "generating" | "ready" | "posted" | "failed";
export type PostStatus = "scheduled" | "posted" | "failed";
export type ArcPosition = "opening" | "rising" | "peak" | "turning" | "falling" | "quiet";
export type PromptDoctrine = "cinematic" | "instagram" | "deepseek" | "editorial";
export type EmotionalBeat =
  | "lonely" | "inspired" | "anxious" | "confident" | "nostalgic"
  | "restless" | "tender" | "productive" | "melancholic" | "quietly_alive";
export type SlotChannel = "feed" | "reel" | "story";
export type GenerationStatus = "pending" | "generating" | "completed" | "failed" | "retrying";
export type BatchStatus = "planned" | "generating" | "ready" | "partial_failed" | "published" | "failed";

export interface Character {
  id: string;
  name: string;
  slug: string;
  soul_id: string | null;
  photo_url: string | null;
  visual_tone: string | null;
  prompt_doctrine: PromptDoctrine | null;
  styling_note: string | null;
  visual_brief: string;
  backstory: string;
  personality: Record<string, string>;
  platforms: CharacterPlatform[];
  posting_time: string;
  is_active: boolean;
  created_at: string;
}

export interface StoryDay {
  id: string;
  character_id: string;
  day_number: number;
  date: string;
  location: string;
  mood: string;
  narrative: string;
  arc_position: ArcPosition;
  emotional_beat: EmotionalBeat | null;
  scene: Record<string, unknown> | null;
  next_hint: string | null;
  ig_caption: string | null;
  hashtags: string[] | null;
  created_at: string;
}

export interface Media {
  id: string;
  story_day_id: string;
  batch_id: string | null;
  type: MediaType;
  channel: SlotChannel | null;
  slot: string | null;
  shot_archetype: string | null;
  sequence_index: number | null;
  higgsfield_prompt: string;
  higgsfield_job_id: string | null;
  media_url: string | null;
  source_url: string | null;
  thumbnail_url: string | null;
  status: MediaStatus;
  generation_status: GenerationStatus | null;
  retry_count: number | null;
  last_error: string | null;
  visual_signature: { palette: string; lens: string; movement: string } | null;
  created_at: string;
}

export interface Post {
  id: string;
  media_id: string;
  platform: CharacterPlatform;
  platform_post_id: string | null;
  scheduled_at: string | null;
  posted_at: string | null;
  status: PostStatus;
  engagement: Record<string, number>;
  created_at: string;
}

export interface StoryDayWithCharacter extends StoryDay {
  chs_characters: Character;
}

export interface MediaWithStory extends Media {
  chs_story_days: StoryDayWithCharacter;
}
