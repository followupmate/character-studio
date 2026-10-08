import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: { from: () => { throw new Error("db not used in these tests"); } } }));

import { inStoryCatchUpWindow, maybeTriggerStoryCatchUp, storyDateUtc, storyCatchUpDisabled } from "./storyCatchUp";
import { dateKeyInZone } from "./captionTemplate";

const at = (iso: string) => new Date(iso);

describe("inStoryCatchUpWindow (UTC)", () => {
  it("never overlaps the Vercel cron hour (06:00-06:59) or its 300 s run", () => {
    for (const t of ["06:00", "06:30", "06:59", "07:00", "07:05", "07:14", "07:15"]) {
      expect(inStoryCatchUpWindow(at(`2026-10-08T${t}:20Z`)), t).toBe(false);
    }
  });
  it("fires only on the first 15-min tick of each half hour between 07:30 and 12:30", () => {
    const eligible: string[] = [];
    for (let m = 0; m < 24 * 60; m += 15) {
      const hh = String(Math.floor(m / 60)).padStart(2, "0");
      const mm = String(m % 60).padStart(2, "0");
      if (inStoryCatchUpWindow(at(`2026-10-08T${hh}:${mm}:25Z`))) eligible.push(`${hh}:${mm}`);
    }
    expect(eligible).toEqual(["07:30", "08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30"]);
  });
  it("inside the window the UTC story date always equals the Europe/Bratislava date (no tz boundary), all year incl. DST", () => {
    for (let d = 0; d < 366; d++) {
      const day = new Date(Date.UTC(2026, 0, 1) + d * 86400000);
      for (const hm of [[7, 30], [12, 30]]) {
        const t = new Date(day.getTime() + (hm[0] * 60 + hm[1]) * 60000);
        expect(storyDateUtc(t)).toBe(dateKeyInZone(t, "Europe/Bratislava"));
      }
    }
  });
});

describe("maybeTriggerStoryCatchUp", () => {
  const env = { CRON_SECRET: "s3cret" };

  it("missing story day inside the window -> fires GET /api/characters/story once with Bearer", async () => {
    const fire = vi.fn(async () => {});
    const findMissing = vi.fn(async () => ["Vivienne"]);
    const r = await maybeTriggerStoryCatchUp("https://app.example", { now: at("2026-10-08T07:30:21Z"), env, findMissing, fire });
    expect(r).toEqual({ triggered: true, reason: "missing story day", date: "2026-10-08", missing: ["Vivienne"] });
    expect(findMissing).toHaveBeenCalledWith("2026-10-08");
    expect(fire).toHaveBeenCalledTimes(1);
    expect(fire).toHaveBeenCalledWith("https://app.example/api/characters/story", { Authorization: "Bearer s3cret" });
  });

  it("story day exists -> no trigger", async () => {
    const fire = vi.fn(async () => {});
    const r = await maybeTriggerStoryCatchUp("https://app.example", { now: at("2026-10-08T08:00:10Z"), env, findMissing: async () => [], fire });
    expect(r.triggered).toBe(false);
    expect(r.reason).toBe("story day exists");
    expect(fire).not.toHaveBeenCalled();
  });

  it("outside the window -> no DB read, no trigger", async () => {
    const fire = vi.fn(async () => {});
    const findMissing = vi.fn(async () => ["Vivienne"]);
    for (const iso of ["2026-10-08T06:45:00Z", "2026-10-08T07:45:00Z", "2026-10-08T13:00:00Z", "2026-10-08T23:30:00Z"]) {
      const r = await maybeTriggerStoryCatchUp("https://app.example", { now: at(iso), env, findMissing, fire });
      expect(r.triggered, iso).toBe(false);
    }
    expect(findMissing).not.toHaveBeenCalled();
    expect(fire).not.toHaveBeenCalled();
  });

  it("STORY_CATCHUP_DISABLED=true is a kill switch", async () => {
    expect(storyCatchUpDisabled({ STORY_CATCHUP_DISABLED: "TRUE" })).toBe(true);
    expect(storyCatchUpDisabled({})).toBe(false);
    const fire = vi.fn(async () => {});
    const r = await maybeTriggerStoryCatchUp("https://app.example", {
      now: at("2026-10-08T07:30:00Z"),
      env: { ...env, STORY_CATCHUP_DISABLED: "true" },
      findMissing: async () => ["Vivienne"],
      fire,
    });
    expect(r.reason).toBe("disabled");
    expect(fire).not.toHaveBeenCalled();
  });

  it("no CRON_SECRET -> fires without an Authorization header (story route itself needs none)", async () => {
    const fire = vi.fn(async () => {});
    await maybeTriggerStoryCatchUp("https://app.example", { now: at("2026-10-08T09:00:00Z"), env: {}, findMissing: async () => ["Vivienne"], fire });
    expect(fire).toHaveBeenCalledWith("https://app.example/api/characters/story", {});
  });
});
