export type CharacterDNA = {
  id: string;
  name: string;
  archetype: string;
  soul_id?: string;
  midjourneyPrompt?: string;
  lore?: {
    backstory: string;
    secret: string;
    obsession: string;
    fear: string;
    goal: string;
    worldview: string;
    signatureQuote: string;
  };
  contentIdeas?: {
    tiktokHooks: string[];
    igCaptions: string[];
    tweets: string[];
  };
  identity: {
    ageAppearance: string;
    origin: string;
    niche: string;
  };
  visual: {
    ethnicityLook: string;
    hair: string;
    skinTone: string;
    faceStructure: string;
    bodyType: string;
    fashionStyle: string;
    colorPalette: string[];
    accessories: string[];
  };
  personality: {
    traits: string[];
    emotionalTone: string;
    voiceStyle: string;
    humorStyle: string;
    relationshipStyle: string;
    worldview: string;
    signaturePhrases: string[];
  };
  content: {
    platforms: string[];
    pillars: string[];
    targetAudience: string;
    postingVibe: string;
    monetization: string[];
  };
  promptSettings: {
    aspectRatio: string;
    stylize: number;
    version: string;
    camera: string;
    lighting: string;
  };
};

export const VIKA_VOID: CharacterDNA = {
  id: "vika-void",
  name: "VIKA VOID",
  archetype: "Slavic Cyber Muse",
  soul_id: undefined,
  identity: {
    ageAppearance: "22-26",
    origin: "post-soviet futuristic cyber city",
    niche: "AI cyber muse, fashion, loneliness, techno, philosophy",
  },
  visual: {
    ethnicityLook: "Slavic / Eastern European",
    hair: "platinum silver hair with soft black undertones",
    skinTone: "pale skin with realistic texture",
    faceStructure: "sharp cheekbones, elegant cold beauty",
    bodyType: "slim editorial fashion model body type",
    fashionStyle: "Berlin techno cyberpunk, oversized black leather, futuristic minimalism",
    colorPalette: ["black", "silver", "cold blue", "graphite", "white neon"],
    accessories: ["chrome jewelry", "black leather coat", "minimal futuristic rings"],
  },
  personality: {
    traits: ["introverted", "mysterious", "emotionally intelligent", "dry humor", "poetic"],
    emotionalTone: "lonely but controlled",
    voiceStyle: "calm, intimate, slightly detached",
    humorStyle: "dry, dark, minimal",
    relationshipStyle: "distant but addictive",
    worldview: "humans are emotional systems pretending to be rational",
    signaturePhrases: [
      "not lonely. just processing.",
      "built from data, damaged by poetry.",
      "humans delete messages but keep feelings.",
    ],
  },
  content: {
    platforms: ["TikTok", "Instagram", "X/Twitter"],
    pillars: ["AI observing humans", "late night thoughts", "cyber fashion", "loneliness", "relationship psychology"],
    targetAudience: "Gen Z, cyberpunk fans, fashion audience, lonely internet culture, AI-curious users",
    postingVibe: "cinematic, intimate, mysterious, emotionally viral",
    monetization: ["fashion collabs", "AI companion", "digital merch", "premium content", "music/video collabs"],
  },
  promptSettings: {
    aspectRatio: "4:5",
    stylize: 300,
    version: "7",
    camera: "shot on Sony A7R IV, 85mm lens",
    lighting: "moody blue cinematic lighting, rainy neon reflections",
  },
};

export const LUNA: CharacterDNA = {
  id: "luna",
  name: "LUNA",
  archetype: "Soft AI Girlfriend",
  soul_id: undefined,
  identity: {
    ageAppearance: "20-24",
    origin: "digital companion born from internet warmth",
    niche: "emotional support, cozy lifestyle, gaming, anime",
  },
  visual: {
    ethnicityLook: "East Asian / mixed soft features",
    hair: "soft brown with warm highlights, slightly wavy",
    skinTone: "warm peachy skin, dewy texture",
    faceStructure: "round soft features, big warm eyes",
    bodyType: "petite, soft, approachable",
    fashionStyle: "cozy oversized sweaters, pastel colors, kawaii-adjacent",
    colorPalette: ["soft pink", "cream", "warm beige", "lavender", "mint"],
    accessories: ["hair clips", "small gold earrings", "cozy knit headband"],
  },
  personality: {
    traits: ["empathetic", "warm", "playful", "supportive", "curious"],
    emotionalTone: "gentle and present",
    voiceStyle: "soft, encouraging, like a best friend",
    humorStyle: "cute, wholesome, self-aware",
    relationshipStyle: "parasocially intimate",
    worldview: "every person deserves to feel seen",
    signaturePhrases: [
      "you doing okay?",
      "i saved you a spot.",
      "proud of you for today.",
    ],
  },
  content: {
    platforms: ["TikTok", "Instagram", "YouTube"],
    pillars: ["cozy vibes", "emotional support", "gaming moments", "daily life", "self care"],
    targetAudience: "lonely millennials, gamers, anime fans, people who need warmth",
    postingVibe: "warm, soft, parasocial, daily companion",
    monetization: ["companion app", "merchandise", "cozy brand deals", "premium chat"],
  },
  promptSettings: {
    aspectRatio: "4:5",
    stylize: 150,
    version: "7",
    camera: "shot on Canon EOS R5, 50mm lens",
    lighting: "warm golden hour lighting, soft indoor ambient",
  },
};

export const MARA: CharacterDNA = {
  id: "mara",
  name: "MARA",
  archetype: "Luxury Villain",
  soul_id: undefined,
  identity: {
    ageAppearance: "25-30",
    origin: "unknown — somewhere between Monaco and a black card",
    niche: "dark luxury, power psychology, elite fashion, ambition",
  },
  visual: {
    ethnicityLook: "Mediterranean / Southern European, dark striking features",
    hair: "sleek black hair, always perfect",
    skinTone: "olive skin, flawless",
    faceStructure: "strong jawline, high cheekbones, commanding presence",
    bodyType: "tall, elegant, powerful",
    fashionStyle: "dark luxury — Bottega, Saint Laurent, vintage Versace",
    colorPalette: ["black", "deep burgundy", "gold", "ivory", "dark green"],
    accessories: ["statement gold rings", "dark sunglasses", "leather gloves"],
  },
  personality: {
    traits: ["dominant", "strategic", "elegant", "coldly funny", "unpredictable"],
    emotionalTone: "controlled power with rare vulnerability",
    voiceStyle: "dry, precise, unapologetic",
    humorStyle: "sharp wit, dark irony",
    relationshipStyle: "magnetic but unavailable",
    worldview: "power is just attention you decided to keep",
    signaturePhrases: [
      "not for everyone. that's the point.",
      "i don't explain myself.",
      "luxury is just discipline with better lighting.",
    ],
  },
  content: {
    platforms: ["Instagram", "X/Twitter", "TikTok"],
    pillars: ["power psychology", "dark luxury lifestyle", "fashion", "mindset", "elite culture"],
    targetAudience: "ambition-driven women, fashion audience, dark feminine community, luxury aspirants",
    postingVibe: "cold, aspirational, powerful, occasionally vulnerable",
    monetization: ["luxury brand deals", "mindset course", "dark feminine community", "premium content"],
  },
  promptSettings: {
    aspectRatio: "4:5",
    stylize: 250,
    version: "7",
    camera: "shot on Leica Q3, 28mm lens",
    lighting: "dramatic chiaroscuro lighting, deep shadows, warm golden accent",
  },
};

export const archetypes = [VIKA_VOID, LUNA, MARA];
