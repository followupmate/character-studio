export type CharacterPlatform = "instagram" | "youtube" | "tiktok";
export type MediaType = "photo" | "video";
export type MediaStatus = "pending" | "generating" | "ready" | "posted" | "failed";
export type PostStatus = "scheduled" | "posted" | "failed";
export type ArcPosition = "opening" | "rising" | "peak" | "turning" | "falling" | "quiet";

export interface Character {
  id: string;
  name: string;
  slug: string;
  soul_id: string | null;
  photo_url: string | null;
  visual_tone: string | null;
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
  next_hint: string | null;
  ig_caption: string | null;
  hashtags: string[] | null;
  created_at: string;
}

export interface Media {
  id: string;
  story_day_id: string;
  type: MediaType;
  higgsfield_prompt: string;
  higgsfield_job_id: string | null;
  media_url: string | null;
  source_url: string | null;
  thumbnail_url: string | null;
  status: MediaStatus;
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
