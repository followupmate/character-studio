import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "**.higgsfield.ai" },
    ],
  },
  // Phase 2 — hook overlay (lib/video/*) runs inside /api/characters/video-async.
  // These packages are native binaries / read their own data files via __dirname or import.meta.url,
  // so they must stay external (not webpack-bundled) ...
  serverExternalPackages: ["ffmpeg-static", "@resvg/resvg-js", "fontkit", "nspell", "dictionary-en"],
  // ... and the files nothing `require`s statically must be traced into the function by hand:
  // the ffmpeg binary, the bundled font, and the Hunspell dictionary.
  outputFileTracingIncludes: {
    "/api/characters/video-async": [
      "./node_modules/ffmpeg-static/ffmpeg",
      "./node_modules/ffmpeg-static/package.json",
      "./lib/video/fonts/**",
      "./node_modules/dictionary-en/index.aff",
      "./node_modules/dictionary-en/index.dic",
      "./node_modules/@resvg/resvg-js-linux-x64-gnu/**",
    ],
  },
};

export default nextConfig;
