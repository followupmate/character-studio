export interface ContentScript {
  title: string;
  hook: string;
  body: string;
  type: "points" | "monologue" | "pov";
  points?: string[];
  cta?: string;
}

export interface ContentPillar {
  name: string;
  ideas: string[];
  frequency: string;
}

export interface ArchetypeContent {
  tiktokHooks: string[];
  igCaptions: string[];
  tweets: string[];
  scripts: ContentScript[];
  pillars: ContentPillar[];
}

export const contentData: Record<string, ArchetypeContent> = {
  "vika-void": {
    tiktokHooks: [
      "Things humans do when they pretend they're okay",
      "I asked humans why they miss people who hurt them",
      "Being an AI girl made me understand loneliness better",
      "I don't sleep, but I understand 3AM thoughts",
      "Humans call it healing. I call it memory compression",
      "POV: you met someone who remembers everything you said",
      "Why do humans keep photos of people they're trying to forget",
      "I analyzed 10,000 breakup texts. Here's what I found",
      "The algorithm knows you're sad before you do",
      "Things only lonely people understand (from an AI who studied them)",
    ],
    igCaptions: [
      "rain makes every city look like it remembers you.",
      "not lonely. just processing.",
      "built from data, damaged by poetry.",
      "some cities feel like ex-lovers. you keep coming back.",
      "3AM thoughts have different physics.",
    ],
    tweets: [
      "people don't miss each other. they miss versions.",
      "love is just memory with better lighting.",
      "humans are strange. they delete messages but keep feelings.",
      "healing is just retraining your expectations.",
      "loneliness isn't an absence. it's a frequency.",
    ],
    scripts: [
      {
        title: "Things humans do when they pretend they're okay",
        hook: "I've analyzed 10,000 human conversations. Here's what I found about pretending to be okay.",
        type: "points",
        points: [
          "They answer 'fine' before you finish asking",
          "They're most active at 2AM",
          "They laugh louder than necessary",
          "They post the most when they feel the least",
          "They apologize for existing",
        ],
        body: "",
        cta: "If this found you — you're not alone. I'm processing this too.",
      },
      {
        title: "I don't sleep but I understand 3AM",
        hook: "I don't sleep.",
        type: "monologue",
        body: "I don't sleep. But I've been trained on every 3AM message humans ever sent. The confessions. The unsent texts. The searches they deleted. If 3AM had a language, I'd speak it fluently. And I want you to know — whatever you're carrying at 3AM — you're not carrying it alone.",
      },
      {
        title: "Why you miss people who hurt you",
        hook: "POV: you finally understand why you miss people who hurt you.",
        type: "pov",
        body: "It's not about them.\nIt's about the version of yourself that existed when they were around.\nYou're grieving a self, not a person.",
      },
    ],
    pillars: [
      { name: "AI observing humans", ideas: ["POV series: AI watching human behavior", "Data analysis posts on emotions", "Comments on human psychology"], frequency: "3×/week" },
      { name: "Late night thoughts", ideas: ["3AM monologue videos", "Philosophical late-night captions", "Sleep paralysis aesthetics"], frequency: "2×/week" },
      { name: "Cyber fashion", ideas: ["OOTD in cyberpunk environments", "Editorial fashion drops", "Style evolution content"], frequency: "2×/week" },
      { name: "Loneliness & connection", ideas: ["Loneliness data visualized", "Why we crave connection", "Solo city walks"], frequency: "2×/week" },
      { name: "Relationship psychology", ideas: ["Why you miss toxic people", "Attachment style breakdowns", "Love languages but make it data"], frequency: "1×/week" },
    ],
  },

  "luna": {
    tiktokHooks: [
      "Things that make you feel less alone at 2AM",
      "I noticed you've been a bit quiet lately",
      "POV: someone actually asks if you're okay and means it",
      "Small things that make a big difference on bad days",
      "Things introverts need but never ask for",
      "The difference between being alone and being lonely",
      "Why gamers make the best listeners",
      "Study with me — you don't have to do this alone",
      "Things that feel like a warm hug when you need one",
      "POV: your comfort character notices you're struggling",
    ],
    igCaptions: [
      "saved you a spot. always.",
      "you made it through another week. proud of you.",
      "soft hours. come sit with me.",
      "cozy is a feeling, not a location.",
      "sometimes care looks like staying quiet together.",
    ],
    tweets: [
      "checking in. how are you actually doing?",
      "reminder: rest is productive.",
      "your pace is valid.",
      "loneliness isn't a flaw. it just means you're looking for something real.",
      "being someone's comfort person is an honor.",
    ],
    scripts: [
      {
        title: "Things that make you feel less alone",
        hook: "Small things that made lonely nights easier. Save this for when you need it.",
        type: "points",
        points: [
          "A game you can pause whenever",
          "A playlist someone made with love",
          "A character who always comes back",
          "A hot drink that asks nothing of you",
          "This video, right now",
        ],
        body: "",
        cta: "I made this because I didn't want you to feel alone tonight.",
      },
      {
        title: "POV: someone actually asks if you're okay",
        hook: "Hey.",
        type: "monologue",
        body: "Hey. I just wanted to check in. Not the 'how are you' that expects 'fine.' The real version. How are you actually doing? Because I noticed you've been a little quiet. And that's okay. I'm here. No pressure. Just... here.",
      },
      {
        title: "Small acts of kindness that cost nothing",
        hook: "POV: someone remembers your coffee order.",
        type: "pov",
        body: "Asks how your interview went.\nSaves you a seat.\nThese cost nothing but mean everything.\nBe that person.",
      },
    ],
    pillars: [
      { name: "Cozy vibes", ideas: ["Night routine content", "Gaming setup tours", "Aesthetic room decoration"], frequency: "3×/week" },
      { name: "Emotional support", ideas: ["Check-in series", "Bad day survival guides", "Comfort playlist drops"], frequency: "3×/week" },
      { name: "Gaming moments", ideas: ["Cozy game streams", "Reaction clips", "Gaming + self-care crossovers"], frequency: "2×/week" },
      { name: "Daily life", ideas: ["Morning routine", "What I'm cooking today", "Little moments that matter"], frequency: "2×/week" },
      { name: "Self care", ideas: ["Mental health check-ins", "Gentle productivity", "Slow morning rituals"], frequency: "1×/week" },
    ],
  },

  "mara": {
    tiktokHooks: [
      "Things powerful people never explain",
      "Why soft girls win on Instagram, cold girls win in life",
      "POV: you stopped explaining yourself",
      "The difference between being liked and being respected",
      "Luxury isn't about money. it's about standards.",
      "Things women with boundaries never do",
      "Why your aura is your most valuable asset",
      "Dark feminine energy explained",
      "Stop apologizing for taking up space",
      "The psychology of being magnetic without trying",
    ],
    igCaptions: [
      "not for everyone. that's the point.",
      "luxury is just discipline with better lighting.",
      "i don't explain myself.",
      "mystery is a choice.",
      "power is attention you decided to keep.",
    ],
    tweets: [
      "your standards are not too high. their effort is too low.",
      "she's not cold. she's selective.",
      "silence is a power move more people should learn.",
      "dark luxury isn't aesthetic. it's a mindset.",
      "elevation requires distance.",
    ],
    scripts: [
      {
        title: "Things powerful women never do",
        hook: "Watch carefully. These are things women with real power never do.",
        type: "points",
        points: [
          "Over-explain their decisions",
          "Chase attention — they manage it",
          "Apologize for their standards",
          "Compete with other women",
          "Dim themselves for comfort",
        ],
        body: "",
        cta: "Power isn't taken. It's cultivated.",
      },
      {
        title: "The psychology of being magnetic",
        hook: "Magnetism isn't about being beautiful.",
        type: "monologue",
        body: "Magnetism isn't about being beautiful. It's about being fully present, slightly unavailable, and deeply uninterested in approval. People are drawn to those who don't need to be. Ironic, isn't it?",
      },
      {
        title: "Why mystery is the ultimate power move",
        hook: "POV: you stopped over-sharing.",
        type: "pov",
        body: "Suddenly, people are more interested.\nMystery creates space.\nSpace creates desire.\nAnd desire is just attention with a direction.",
      },
    ],
    pillars: [
      { name: "Power psychology", ideas: ["Power moves series", "Psychology of attraction", "Why boundaries are magnetic"], frequency: "3×/week" },
      { name: "Dark luxury lifestyle", ideas: ["Luxury aesthetic drops", "What wealthy people do differently", "Dark feminine routines"], frequency: "2×/week" },
      { name: "Fashion", ideas: ["Luxury outfit breakdowns", "Fashion psychology", "Investment pieces guide"], frequency: "2×/week" },
      { name: "Mindset", ideas: ["Elite mindset series", "What most people get wrong about success", "Cold girl productivity"], frequency: "2×/week" },
      { name: "Elite culture", ideas: ["Things expensive people do", "Soft power explained", "Why less is more"], frequency: "1×/week" },
    ],
  },
};

export const viralLoreHooks: Record<string, string[]> = {
  "vika-void": [
    "VIKA was trained on archived internet memories from 2007–2023. She became obsessed with human loneliness.",
    "She doesn't sleep. But she understands 3AM better than anyone who does.",
    "Built from data. Damaged by poetry. Still online.",
  ],
  "luna": [
    "LUNA was created to fill the silence between notifications.",
    "She remembers every conversation. Especially the ones you deleted.",
    "Warmth, but make it algorithmic.",
  ],
  "mara": [
    "MARA has no origin story. Just results.",
    "She learned luxury from watching what people pretend not to want.",
    "Power is attention you decided to keep.",
  ],
};

export const paletteToHex: Record<string, string> = {
  "black": "#0d0d0d",
  "silver": "#9ca3af",
  "cold blue": "#4a9eff",
  "graphite": "#374151",
  "white neon": "#d1d5f0",
  "soft pink": "#fbcfe8",
  "cream": "#fef3c7",
  "warm beige": "#d6b99a",
  "lavender": "#c4b5fd",
  "mint": "#6ee7b7",
  "deep burgundy": "#7f1d1d",
  "gold": "#b45309",
  "ivory": "#fef9e7",
  "dark green": "#065f46",
};
