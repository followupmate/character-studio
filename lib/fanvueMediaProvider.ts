import { generateSoulImage } from "@/lib/higgsfieldSoul";
import type { ContentLevel } from "@/lib/fanvueContinuation";

// Pluggable media-generation provider for Fanvue paid continuation shots. v1 has a single
// implementation (Higgsfield Soul) that supports premium_sensual/erotic_tease only — Higgsfield
// actively rejects NSFW output (status "nsfw", lib/higgsfieldSoul.ts), so explicit_adult is never
// routed to it. When an adult-compatible provider is added later, it plugs in here as a second
// implementation + a small router — the storyboard/approval/commercial/publish code above this
// layer never has to change.
export interface FanvueMediaProvider {
  name: string;
  supports(contentLevel: ContentLevel): boolean;
  generate(opts: { prompt: string; soulId: string; mediaId: string; aspect?: string }): Promise<string>;
}

export const higgsfieldProvider: FanvueMediaProvider = {
  name: "higgsfield",
  supports(contentLevel) {
    return contentLevel === "premium_sensual" || contentLevel === "erotic_tease";
  },
  async generate({ prompt, soulId, mediaId, aspect }) {
    return generateSoulImage({ prompt, soulId, mediaId, aspect: aspect ?? "3:4" });
  },
};

const PROVIDERS: FanvueMediaProvider[] = [higgsfieldProvider];

// Returns null when no provider supports the requested content_level (currently: explicit_adult)
// — callers must surface a controlled "provider doesn't support this yet, use manual upload"
// response instead of calling generate() and letting it fail on NSFW.
export function providerFor(contentLevel: ContentLevel): FanvueMediaProvider | null {
  return PROVIDERS.find((p) => p.supports(contentLevel)) ?? null;
}
