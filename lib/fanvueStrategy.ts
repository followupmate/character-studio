// FANVUE STRATEGY — derives a safe, state-aware recommendation from a read-only MCP audit snapshot
// (chs_characters.fanvue_snapshot). Pure function, no side effects, no MCP/network. The snapshot is
// produced by the agent via read-only Fanvue MCP tools; the app only reads + interprets it.

export interface FanvueSnapshot {
  audited_at?: string;
  handle?: string;
  display_name?: string;
  status?: string;
  followers?: number;
  subscribers?: number;
  earnings_total?: number;
  post_count?: number;
  ppv_post_count?: number;
  smart_lists?: Record<string, number>;
}

export interface FanvueStrategy {
  phase: "pre_launch" | "growth_first" | "early_monetize" | "scale";
  headline: string;
  recommendations: string[];
  hold: string[]; // things to deliberately NOT do yet
}

export function deriveStrategy(s: FanvueSnapshot | null): FanvueStrategy | null {
  if (!s) return null;
  const subs = s.subscribers ?? 0;
  const followers = s.followers ?? 0;
  const spenders = s.smart_lists?.spent_more_than_50 ?? 0;

  if (subs === 0 && followers === 0) {
    return {
      phase: "pre_launch",
      headline: "Pre-launch — build the funnel before monetizing.",
      recommendations: [
        "Create the IG→Fanvue tracking link (gated, one explicit confirm) and put it in the IG bio.",
        "Seed Fanvue with a few free / teaser posts so the profile isn't empty when traffic arrives.",
        "Keep IG growing: lifestyle/wellness reach, Fanvue CTA on only ~25–35% of posts.",
        "Prepare unlock drafts here so a back-catalogue is ready the day subscribers start.",
      ],
      hold: ["PPV pricing", "paid subscription pushes", "mass DMs", "any price/tier change (manual, not in MCP)"],
    };
  }
  if (subs < 25) {
    return {
      phase: "growth_first",
      headline: "Early audience — convert followers, soft monetization only.",
      recommendations: [
        "Promote a few 'ready' unlock drafts as low-price PPV or free-trial subscriber perks.",
        "Keep the IG funnel primary; nudge the most engaged followers to subscribe.",
        "Welcome new subscribers warmly (manual/approved DMs only).",
      ],
      hold: ["aggressive mass PPV", "high subscription prices"],
    };
  }
  if (subs < 100 || spenders < 5) {
    return {
      phase: "early_monetize",
      headline: "Monetization ramp — test PPV and series.",
      recommendations: [
        "Release unlock series (Room 407 / Body Diary / Pool Heat) as scheduled PPV — each gated by approval.",
        "Segment with smart lists; offer top spenders early access.",
        "Track fanvue_clicks per IG post to double down on what converts.",
      ],
      hold: ["untested high prices", "unmoderated automation"],
    };
  }
  return {
    phase: "scale",
    headline: "Scale — lean into what converts, keep it sustainable.",
    recommendations: [
      "Prioritize the highest-converting series; retire weak ones.",
      "Reward top spenders; keep a steady ready-draft pipeline.",
    ],
    hold: ["anything that risks the account or the brand"],
  };
}
