import Anthropic from "@anthropic-ai/sdk";
import { requireEnv } from "@/lib/env";

// Lazy: don't read the key at import time so the build (no secrets) doesn't fail;
// requireEnv throws a readable error on first actual use if the key is missing.
let _anthropic: Anthropic | undefined;

export const anthropic = new Proxy({} as Anthropic, {
  get(_t, prop: string | symbol, recv) {
    if (!_anthropic) _anthropic = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
    const v = Reflect.get(_anthropic, prop, recv);
    return typeof v === "function" ? v.bind(_anthropic) : v;
  },
});
