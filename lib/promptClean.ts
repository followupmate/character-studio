// Prompt cleaning — single source of truth. Previously five slightly divergent
// copies lived in generate-media, video-async, generate-higgsfield, MediaCard
// and higgsfieldSoul; this module is the superset of all of them.

// Strip the "Model: Soul 2 🖼 Image Prompt:" / "Model: Seedance 🎬 Video Prompt:"
// header Claude sometimes emits before the actual prompt, plus leading emoji.
export function stripPromptHeader(raw: string): string {
  return raw
    .replace(/^Model:\s*(?:Soul\s*\d+|Seedance\s*\S*)\s*[\u{1F000}-\u{1FFFF}☀-➿]*\s*(?:Video\s*Prompt|Image\s*Prompt)?[\s:]*/imu, "")
    .replace(/^(?:Video|Image)\s*Prompt[\s:]*/i, "")
    .replace(/^[\s\u{1F000}-\u{1FFFF}☀-➿]+/u, "")
    .trim();
}

// Sanitize prompt for Google IMAGE_SAFETY and Veo video safety classifiers.
// Targets known triggers: "nude" as clothing color, detailed anatomical body
// descriptions combined with minimal clothing. These trigger post-generation
// image safety regardless of reference images or safetySettings thresholds.
// Applied to both image and video generation before sending to any Google API.
export function sanitizePrompt(prompt: string): string {
  // Strip "Model: Soul 2 ..." prefixes (may appear on multiple lines if Claude output multiple alternatives)
  const stripped = prompt.replace(/^Model:\s*Soul\s*\d+[^\n]*\n?/gim, "");

  // Split on " ; " (two-scene separator) or double-newline (multiple alternatives) — keep first only
  const firstBlock = stripped
    .split(/\s*;\s+(?=[A-Z])|\n{2,}/)[0]
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .slice(0, 3)   // max 3 lines = one caption
    .join(" ");

  return firstBlock
    // Strip "Signature: ..." tags — model renders these as literal text/watermarks in the image
    .replace(/Signature:\s*[^\n.;]+[.\n]?/gi, "")
    // Strip "Frame contains: ..." blocks
    .replace(/Frame contains:[^.]*\./gi, "")
    // "nude [clothing]" → safe color (biggest IMAGE_SAFETY trigger)
    .replace(/\bnude\s+(bandeau|bikini|bra|bralette|top|bodysuit|leotard|shorts|thong|underwear|swimsuit|one-piece)\b/gi, "sand-colored $1")
    .replace(/\bnude-toned\b/gi, "skin-toned")
    .replace(/\bnude\s+(?=fabric|lace|silk|satin|mesh)/gi, "sheer ")
    // Bikini → neutral clothing — full chain: specific style → generic → neutral
    // "triangle bikini top" → "bikini top" → "crop top"
    // "high-cut minimal bikini bottom" → "bikini bottom" → "shorts"
    .replace(/\btriangle\s+bikini\b/gi, "bikini")
    .replace(/\bhigh-cut\s+(?:minimal\s+)?bikini\b/gi, "bikini")
    .replace(/\bminimal\s+bikini\b/gi, "bikini")
    .replace(/\bhigh-cut\b/gi, "")
    .replace(/\bbikini\s+top\b/gi, "crop top")
    .replace(/\bbikini\s+bottom\b/gi, "shorts")
    .replace(/\bbikini\s+set\b/gi, "swimwear")
    .replace(/\bbikini\b/gi, "swimwear")
    // "open shirt" combined with swimwear triggers classifier — remove "open" modifier
    .replace(/\bopen\s+shirt\b/gi, "shirt")
    // Revealing/context language that triggers safety classifier
    .replace(/\brevealing\b/gi, "showing")
    .replace(/\bfalls\s+open\b/gi, "rests")
    .replace(/\bopen\s+at\s+the\s+hip\b/gi, "at the hip")
    // Anatomical body descriptions
    .replace(/\bnarrow feminine shoulders\b/gi, "shoulders")
    .replace(/\bsoft musculature\b/gi, "")
    .replace(/\bsmooth skin\b/gi, "natural skin")
    .replace(/\bbare back\b/gi, "back")
    .replace(/\bbare shoulders\b/gi, "shoulders")
    .replace(/\bbare skin\b/gi, "skin")
    .replace(/\bexposed skin\b/gi, "skin")
    // Undressing/motion language
    .replace(/\bsliding open\b/gi, "draped")
    .replace(/\bslipping off\b/gi, "draped over")
    .replace(/\bfalling off\b/gi, "resting on")
    .replace(/\bslipped off\b/gi, "draped")
    .replace(/\bslid(?:ing)? open\b/gi, "draped")
    .replace(/\bloosely belted\b/gi, "belted")
    .replace(/\buntied\b/gi, "loosely tied")
    .replace(/\bopen robe\b/gi, "robe")
    .replace(/\bvisible beneath\b/gi, "worn under")
    .replace(/\bpeek(?:ing)? (?:out|through)\b/gi, "visible")
    .replace(/\bslipping\b/gi, "resting")
    .replace(/\bbare feet\b/gi, "feet")
    .replace(/\bbare legs\b/gi, "legs")
    .replace(/\bbare arms\b/gi, "arms")
    .replace(/\bbare midriff\b/gi, "midriff")
    .replace(/\bher skin\b/gi, "her")
    .replace(/\bflesh\b/gi, "")
    // Clean up
    .replace(/,\s*,/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();
}
