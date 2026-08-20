import type { PromptPackage } from "@/lib/promptDirector";

export type CharacterPlatform = "instagram" | "youtube" | "tiktok";
export type MediaType = "photo" | "video";
export type MediaStatus = "pending" | "generating" | "ready" | "posted" | "failed";
export type PostStatus = "scheduled" | "posted" | "failed";
export type ArcPosition = "opening" | "rising" | "peak" | "turning" | "falling" | "quiet";
export type PromptDoctrine = "cinematic" | "instagram" | "deepseek" | "editorial" | "nano_banana";
export type EmotionalBeat =
  | "detached" | "observed" | "mundane" | "drifting" | "mildly_displaced"
  | "watchful" | "absent" | "uneventful" | "half_present" | "almost_there"
  | "present" | "playful" | "sultry" | "golden" | "effortless" | "candid" | "intimate" | "wandering" | "languid" | "aspirational";
export type SlotChannel = "feed" | "reel" | "story";
export type GenerationStatus = "pending" | "generating" | "completed" | "failed" | "retrying";
export type BatchStatus = "planned" | "generating" | "ready" | "partial_failed" | "published" | "failed";
// Canonical StoryTier — single source of truth (lib/storyTier.ts re-exports this).
// ACTIVE tiers are the only ones the rotation picks (see TIER_WEIGHTS); the rest
// are HISTORICAL — kept so already-stored story_days (and the DB tier CHECK) still
// type-check and read, but never re-enter the active rotation.
export type StoryTier =
  // active
  | "lived_moments"
  | "everyday_life"
  | "wellness_fitness"
  | "intimate_aesthetic"
  | "luxe_car"
  // historical (readable only, not re-selected)
  | "lifestyle_travel"
  | "grounded_routine"
  | "cinematic_melancholy"
  | "incidental_wrongness"
  | "entropy";

// lived_moments sub-worlds — one is chosen per lived_moments day.
export type MomentFamily =
  | "home_private"
  | "friends_fun"
  | "vacation_beach_water"
  | "pets_spontaneous"
  | "city_transit";

// Per-day magnetism intensity (currently used by lived_moments; the shape is
// generic so other tiers can adopt it later without a schema change).
export type MagnetismLevel = "soft" | "playful" | "flirty" | "sensual";
export type DriftSeedKind = "timestamp_mismatch" | "impossible_weather_memory" | "location_drop" | "golden_hour_moment" | "hotel_morning";
export interface DriftSeed { kind: DriftSeedKind; detail?: string }

// ── open_life_generation_v1 (situation planner) — shared unions, single source of truth. ──
// Re-exported from lib/sexualEnergyConfig.ts and lib/situationPlanner.ts the same way
// StoryTier/MomentFamily/MagnetismLevel are re-exported from lib/storyTier.ts above.
export type SexualEnergyLevel = "subtle" | "warm" | "playful" | "provocative" | "intimate";
export type MagnetismReason =
  | "physical_attraction"
  | "playful_femininity"
  | "private_access"
  | "social_desirability"
  | "body_confidence"
  | "aspirational_lifestyle"
  | "provocative_ambiguity"
  | "intimate_curiosity"
  | "adventurous_energy";
export type ContinuityPhase = "standalone" | "setup" | "event" | "aftermath";
export type FanvueTensionPotential = "none" | "soft" | "clear" | "strong";
export type SocialContextMode = "alone" | "off_camera_person" | "ambient_public" | "partial_companion";

// playful_hot_world_v1 — same "shared unions, re-exported from lib/" convention as above.
export type MoodTemperature = "soft" | "warm" | "hot";
export type VitalityLevel = "calm" | "alive" | "playful" | "electric";
export type SocialPulse = "private" | "suggested_social" | "social" | "party_adjacent";
export type Seasonality = "neutral" | "summer" | "high_summer";
export type ColorEnergy = "muted" | "fresh" | "vivid";
export type FunFactor = "low" | "medium" | "high";

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
  lora_model_id: string | null;
  lora_trigger_word: string | null;
  lora_provider: string | null;
  fanvue_snapshot?: Record<string, unknown> | null;
  feature_flags?: Record<string, boolean> | null;
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
  tier: StoryTier | null;
  moment_family: MomentFamily | null; // set only on lived_moments days
  magnetism_level: MagnetismLevel | null; // set only on lived_moments days (for now)
  drift_seeds: DriftSeed[] | null;
  next_hint: string | null;
  ig_caption: string | null;
  hashtags: string[] | null;
  hook_text: string | null;
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
  visual_signature: {
    palette: string;
    lens: string;
    movement: string;
    // open_life_generation_v1 — performance-logging tags, additive only (spec §15). Recorded
    // for future engagement analysis; never read by getGrowthBias() or any auto-weighting logic.
    situation_tags?: {
      tier: string | null;
      life_domain: string | null;
      sexual_energy_level: string | null;
      sexual_expression_family: string | null;
      magnetism_reason: string | null;
      fanvue_tension_potential: string | null;
      visual_cliche: string | null;
      activity_family: string | null;
      location_family: string | null;
      continuity_phase: string | null;
    };
    // prompt_director_v1 — additive provenance (lib/dailyBatch.ts's mergeVisualSignature()),
    // present only when the slot was compiled via lib/promptDirector instead of lib/slotPrompts.ts.
    prompt_director?: PromptPackage;
  } | null;
  hook_text: string | null;
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

// Money view: summary row for best-performing posts (dashboard)
export interface TopPostSummary {
  id: string;
  post_type: string;
  growth_score: number;
  growth_winner: boolean | null;
  engagement: Record<string, number> | null;
  posted_at: string | null;
  character_id: string | null;
}
