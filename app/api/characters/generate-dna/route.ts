import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are a creative director for AI influencer characters.
Generate a complete character DNA profile from a concept description.
Return ONLY valid JSON, no markdown, no code blocks.
The JSON must match this exact structure:
{
  "id": "slug-from-name",
  "name": "CHARACTER NAME",
  "archetype": "archetype label",
  "identity": {
    "ageAppearance": "age range",
    "origin": "origin story",
    "niche": "content niche"
  },
  "visual": {
    "ethnicityLook": "description",
    "hair": "hair description",
    "skinTone": "skin description",
    "faceStructure": "face description",
    "bodyType": "body description",
    "fashionStyle": "fashion description",
    "colorPalette": ["color1", "color2", "color3"],
    "accessories": ["accessory1", "accessory2"]
  },
  "personality": {
    "traits": ["trait1", "trait2", "trait3"],
    "emotionalTone": "tone description",
    "voiceStyle": "voice description",
    "humorStyle": "humor description",
    "relationshipStyle": "relationship description",
    "worldview": "worldview statement",
    "signaturePhrases": ["phrase1", "phrase2", "phrase3"]
  },
  "content": {
    "platforms": ["Instagram", "TikTok"],
    "pillars": ["pillar1", "pillar2", "pillar3"],
    "targetAudience": "audience description",
    "postingVibe": "vibe description",
    "monetization": ["method1", "method2"]
  },
  "promptSettings": {
    "aspectRatio": "4:5",
    "stylize": 250,
    "version": "7",
    "camera": "shot on Sony A7R IV, 85mm lens",
    "lighting": "cinematic lighting description"
  },
  "midjourneyPrompt": "full midjourney prompt for this character",
  "lore": {
    "backstory": "character backstory",
    "secret": "character secret",
    "obsession": "what they are obsessed with",
    "fear": "what they fear",
    "goal": "their goal",
    "worldview": "their worldview",
    "signatureQuote": "their signature quote"
  },
  "contentIdeas": {
    "tiktokHooks": ["hook1", "hook2", "hook3", "hook4", "hook5"],
    "igCaptions": ["caption1", "caption2", "caption3"],
    "tweets": ["tweet1", "tweet2", "tweet3"]
  }
}`;

export async function POST(req: NextRequest) {
  try {
    const { concept } = await req.json();
    if (!concept?.trim()) {
      return NextResponse.json({ error: "Missing concept" }, { status: 400 });
    }

    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Create a complete AI influencer character based on this concept: "${concept}"`,
        },
      ],
    });

    const raw = msg.content[0].type === "text" ? msg.content[0].text : "";
    const cleaned = raw
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const dna = JSON.parse(cleaned);
    return NextResponse.json({ success: true, dna });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
