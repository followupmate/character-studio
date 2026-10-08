// Phase 6 — reel caption grounding.
//
// Root cause: chs_story_days.ig_caption is written by generateStoryDayContent() from the story
// narrative/situation BEFORE the scene brief, slot prompts or the actual frame exist. from-batch then
// copies it verbatim onto the reel. When the shot that is actually published differs from the story
// (a promptOverride close-up, a regenerated start frame, a prop the model dropped), the caption
// still talks about the cat / the egg / the slipped strap that is not on screen.
//
// Fix: validate the caption against the FINAL image prompt that produced the reel (the
// reel_start_frame's chs_media.higgsfield_prompt — promptOverride is persisted there — falling back
// to the reel_video prompt). Any sentence naming a concrete visual referent (animal, food/drink,
// handled object, wardrobe item or wardrobe state) that the final prompt does not positively
// contain is dropped. Deterministic, no LLM, no DB change.

import { isCtaLine, isReelShareLine } from "@/lib/captionTemplate";

export interface GroundingTerm {
  id: string;
  /** how the caption may refer to it */
  caption: RegExp;
  /** what in the final prompt counts as "this is visible" */
  evidence: RegExp;
}

const w = (alts: string) => new RegExp(`\\b(?:${alts})\\b`, "i");

// Wardrobe *state* (strap off / slipping) needs the state in the prompt, not just the garment:
// "thin straps on both shoulders" does NOT ground "one strap is already off".
const STRAP_STATE = /\bstraps?\b[^.,;!?\n]{0,30}\b(?:off|down|slipp\w*|slid\w*|fall\w*|fell|dropp\w*|loose|undone)\b|\b(?:slipp\w*|slid\w*|fell|fall\w*|dropp\w*|undone)\b[^.,;!?\n]{0,30}\bstraps?\b/i;

export const GROUNDING_TERMS: GroundingTerm[] = [
  // animals
  { id: "cat", caption: w("cats?|kittens?|kitty|kitties"), evidence: w("cats?|kittens?|kitty|feline|british shorthair|shorthair|tabby|siamese|maine coon") },
  { id: "dog", caption: w("dogs?|pupp(?:y|ies)|pups?|doggo"), evidence: w("dogs?|pupp(?:y|ies)|pups?|terrier|retriever|poodle|spaniel|dachshund|bulldog|whippet|greyhound") },
  { id: "pet", caption: w("pets?"), evidence: w("pets?|cats?|kittens?|dogs?|pupp(?:y|ies)|shorthair") },
  { id: "bird", caption: w("birds?|pigeons?|seagulls?|parrots?"), evidence: w("birds?|pigeons?|seagulls?|gulls?|parrots?") },
  // food & drink
  { id: "egg", caption: w("eggs?|omelett?e|yolks?"), evidence: w("eggs?|omelett?e|yolks?") },
  { id: "croissant", caption: w("croissants?|pastr(?:y|ies)"), evidence: w("croissants?|pastr(?:y|ies)") },
  { id: "toast", caption: w("toast"), evidence: w("toast") },
  { id: "cake", caption: w("cakes?|cupcakes?"), evidence: w("cakes?|cupcakes?") },
  { id: "pasta", caption: w("pasta|spaghetti|noodles"), evidence: w("pasta|spaghetti|noodles") },
  { id: "pizza", caption: w("pizzas?"), evidence: w("pizzas?") },
  { id: "fruit", caption: w("strawberr(?:y|ies)|cherr(?:y|ies)|peach(?:es)?|oranges?|lemons?|figs?|grapes?"), evidence: w("strawberr(?:y|ies)|cherr(?:y|ies)|peach(?:es)?|oranges?|lemons?|figs?|grapes?|fruit") },
  { id: "ice_cream", caption: w("ice cream|gelato"), evidence: w("ice cream|gelato") },
  { id: "wine", caption: w("wine|champagne|prosecco|cava"), evidence: w("wine|champagne|prosecco|cava|wine ?glass(?:es)?|flutes?") },
  { id: "cocktail", caption: w("cocktails?|martinis?|spritz|negroni|margaritas?"), evidence: w("cocktails?|martinis?|spritz|negroni|margaritas?|coupe") },
  { id: "coffee", caption: w("coffee|espresso|latte|cappuccino|cortado|flat white"), evidence: w("coffee|espresso|latte|cappuccino|cortado|flat white|coffee cup|mug") },
  { id: "matcha", caption: w("matcha"), evidence: w("matcha") },
  { id: "tea", caption: w("tea"), evidence: w("tea|teacup|teapot") },
  // handled objects
  { id: "suitcase", caption: w("suitcases?|luggage|carry-on"), evidence: w("suitcases?|luggage|carry-on") },
  { id: "book", caption: w("books?|novels?"), evidence: w("books?|novels?|paperback") },
  { id: "phone", caption: w("phones?|iphone"), evidence: w("phones?|iphone|smartphone") },
  { id: "laptop", caption: w("laptops?|macbook"), evidence: w("laptops?|macbook") },
  { id: "flowers", caption: w("flowers?|bouquets?|peon(?:y|ies)|roses?|tulips?"), evidence: w("flowers?|bouquets?|peon(?:y|ies)|roses?|tulips?|blooms?") },
  { id: "candle", caption: w("candles?"), evidence: w("candles?|candlelight") },
  { id: "keys", caption: w("keys"), evidence: w("keys") },
  { id: "car", caption: w("cars?|taxi|uber"), evidence: w("cars?|taxi|convertible|car door|dashboard") },
  { id: "bike", caption: w("bikes?|bicycles?|vespa|scooter"), evidence: w("bikes?|bicycles?|vespa|scooter") },
  { id: "umbrella", caption: w("umbrellas?"), evidence: w("umbrellas?") },
  // wardrobe items
  { id: "robe", caption: w("robes?|bathrobe"), evidence: w("robes?|bathrobe") },
  { id: "towel", caption: w("towels?"), evidence: w("towels?") },
  { id: "heels", caption: w("heels|stilettos|pumps"), evidence: w("heels|stilettos|pumps") },
  { id: "sunglasses", caption: w("sunglasses"), evidence: w("sunglasses") },
  { id: "hat", caption: w("hats?|caps?"), evidence: w("hats?|caps?|beret") },
  { id: "jacket", caption: w("jackets?|blazers?|coats?|trench"), evidence: w("jackets?|blazers?|coats?|trench") },
  { id: "swimwear", caption: w("bikinis?|swimsuits?|swimwear"), evidence: w("bikinis?|swimsuits?|swimwear|one-piece") },
  { id: "lingerie", caption: w("lingerie|stockings|garters?|bra"), evidence: w("lingerie|stockings|garters?|bra|bralette") },
  { id: "boots", caption: w("boots"), evidence: w("boots") },
  { id: "cardigan", caption: w("cardigans?|hoodies?|sweaters?|jumpers?"), evidence: w("cardigans?|hoodies?|sweaters?|jumpers?|knit") },
  // wardrobe state
  { id: "strap_off", caption: STRAP_STATE, evidence: STRAP_STATE },
];

const NEGATION_BEFORE = /\b(?:no|not|without|never|nor|zero)\s+(?:[\w-]+\s+){0,2}$/i;

/** true when `re` matches `text` at least once NOT directly preceded by a negation ("no robe", "without a jacket"). */
export function hasPositiveMention(text: string, re: RegExp): boolean {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  let m: RegExpExecArray | null;
  while ((m = g.exec(text)) !== null) {
    const before = text.slice(Math.max(0, m.index - 40), m.index);
    if (!NEGATION_BEFORE.test(before)) return true;
    if (m[0].length === 0) g.lastIndex++;
  }
  return false;
}

/** Ids of concrete referents the caption text names but the grounding text does not show. */
export function findUngroundedReferences(captionText: string, groundingText: string): string[] {
  const out: string[] = [];
  for (const t of GROUNDING_TERMS) {
    if (hasPositiveMention(captionText, t.caption) && !hasPositiveMention(groundingText, t.evidence)) out.push(t.id);
  }
  return out;
}

export interface GroundedCaption {
  text: string;
  /** false when there was no grounding text (caption returned unchanged) */
  checked: boolean;
  dropped: Array<{ sentence: string; terms: string[] }>;
}

function splitSentences(line: string): string[] {
  return line.split(/(?<=[.!?…])\s+/).filter((s) => s.trim() !== "");
}

/**
 * Drops every caption sentence that names something the final shot does not contain.
 * Line structure is kept (a line that loses all its sentences disappears). With no grounding text
 * the caption is returned unchanged (`checked: false`) — never guess.
 */
export function groundCaption(caption: string | null | undefined, groundingText: string | null | undefined): GroundedCaption {
  const text = caption ?? "";
  const ground = (groundingText ?? "").trim();
  if (!ground || !text.trim()) return { text, checked: !!ground, dropped: [] };
  const dropped: GroundedCaption["dropped"] = [];
  const rawLines = text.split(/\r?\n/);
  const lastIdx = rawLines.length - 1;
  const lines = rawLines.map((line, i) => {
    if (line.trim() === "") return line;
    // share / CTA lines are asks, not claims about the frame ("one more coffee") — never touched
    if (isReelShareLine(line) || isCtaLine(line, i === lastIdx)) return line;
    const kept = splitSentences(line).filter((s) => {
      const terms = findUngroundedReferences(s, ground);
      if (terms.length > 0) {
        dropped.push({ sentence: s.trim(), terms });
        return false;
      }
      return true;
    });
    return kept.length > 0 ? kept.join(" ") : null;
  });
  const out = lines
    .filter((l): l is string => l !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text: out, checked: true, dropped };
}

/**
 * The text that describes what is actually on screen in a reel: the reel_start_frame prompt (the
 * i2v source image; promptOverride is persisted into higgsfield_prompt) — only when absent, the
 * reel_video prompt. The video/motion prompt is NOT merged in when a start frame exists: it is
 * written from the scene brief and can still name props the final frame no longer has.
 */
export function reelGroundingText(startFramePrompt: string | null | undefined, reelVideoPrompt: string | null | undefined): string | null {
  const sf = (startFramePrompt ?? "").trim();
  if (sf) return sf;
  const rv = (reelVideoPrompt ?? "").trim();
  return rv || null;
}
