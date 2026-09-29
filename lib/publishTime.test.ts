import { describe, it, expect } from "vitest";
import { scheduledIso, localToUtcIso, slotTime, weekdayKey, scheduleFor, localDateIn, isMissingScheduleColumn, type PostingSchedule } from "./publishTime";

describe("scheduledIso", () => {
  const NOW = Date.parse("2026-07-01T08:00:00.000Z");

  it("schedules at the character's posting time on the given date (UTC)", () => {
    expect(scheduledIso("2026-07-02", "10:00", 0, NOW)).toBe("2026-07-02T10:00:00.000Z");
  });

  it("applies the offset (reel = +8h prime time)", () => {
    expect(scheduledIso("2026-07-02", "10:00", 8 * 60, NOW)).toBe("2026-07-02T18:00:00.000Z");
  });

  it("never schedules into the past — pushes to now + 1 min", () => {
    expect(scheduledIso("2026-06-01", "10:00", 0, NOW)).toBe(new Date(NOW + 60_000).toISOString());
  });

  it("falls back to 10:00 on malformed posting_time", () => {
    expect(scheduledIso("2026-07-02", "", 0, NOW)).toBe("2026-07-02T10:00:00.000Z");
  });
});


const TZ = "Europe/Bratislava";
const VIVIENNE: PostingSchedule = {
  mon: { story: "11:00", reel: "17:30" },
  tue: { story: "11:00", reel: "17:30" },
  wed: { story: "11:00", reel: "17:30" },
  thu: { story: "11:00", reel: "17:30" },
  fri: { story: "11:00", reel: "17:30" },
  sat: { story: "11:00", reel: "16:00" },
  sun: { story: "16:00", reel: null },
};
const EARLY = Date.parse("2026-01-01T00:00:00.000Z");

describe("localToUtcIso", () => {
  it("summer (CEST, UTC+2): 11:00 local = 09:00Z", () => {
    expect(localToUtcIso("2026-09-30", "11:00", TZ, EARLY)).toBe("2026-09-30T09:00:00.000Z");
    expect(localToUtcIso("2026-09-30", "17:30", TZ, EARLY)).toBe("2026-09-30T15:30:00.000Z");
  });
  it("winter (CET, UTC+1): 11:00 local = 10:00Z", () => {
    expect(localToUtcIso("2026-12-01", "11:00", TZ, EARLY)).toBe("2026-12-01T10:00:00.000Z");
  });
  it("2026-10-25 DST end (03:00 CEST -> 02:00 CET): day is 25h long", () => {
    expect(localToUtcIso("2026-10-24", "16:00", TZ, EARLY)).toBe("2026-10-24T14:00:00.000Z"); // CEST
    expect(localToUtcIso("2026-10-25", "16:00", TZ, EARLY)).toBe("2026-10-25T15:00:00.000Z"); // CET
    expect(localToUtcIso("2026-10-25", "11:00", TZ, EARLY)).toBe("2026-10-25T10:00:00.000Z");
    expect(localToUtcIso("2026-10-26", "11:00", TZ, EARLY)).toBe("2026-10-26T10:00:00.000Z");
  });
  it("ambiguous local time in the autumn overlap resolves to the first occurrence", () => {
    expect(localToUtcIso("2026-10-25", "02:30", TZ, EARLY)).toBe("2026-10-25T00:30:00.000Z");
  });
  it("2026-03-29 DST start: 11:00 local = 09:00Z after, 10:00Z before; gap time lands after the gap", () => {
    expect(localToUtcIso("2026-03-28", "11:00", TZ, EARLY)).toBe("2026-03-28T10:00:00.000Z");
    expect(localToUtcIso("2026-03-29", "11:00", TZ, EARLY)).toBe("2026-03-29T09:00:00.000Z");
    expect(localToUtcIso("2026-03-29", "02:30", TZ, EARLY)).toBe("2026-03-29T01:30:00.000Z"); // = 03:30 CEST
  });
  it("other zones work (America/New_York)", () => {
    expect(localToUtcIso("2026-07-01", "09:00", "America/New_York", EARLY)).toBe("2026-07-01T13:00:00.000Z");
  });
  it("past time pushes to now + 1 min", () => {
    const now = Date.parse("2026-09-30T12:00:00.000Z");
    expect(localToUtcIso("2026-09-30", "11:00", TZ, now)).toBe(new Date(now + 60_000).toISOString());
  });
  it("invalid tz falls back to Europe/Bratislava; malformed time -> null", () => {
    expect(localToUtcIso("2026-09-30", "11:00", "Nope/Zone", EARLY)).toBe("2026-09-30T09:00:00.000Z");
    expect(localToUtcIso("2026-09-30", "25:00", TZ, EARLY)).toBeNull();
    expect(localToUtcIso("2026-09-30", "abc", TZ, EARLY)).toBeNull();
  });
});

describe("weekdayKey / slotTime", () => {
  it("maps calendar dates to weekdays", () => {
    expect(weekdayKey("2026-09-29")).toBe("tue");
    expect(weekdayKey("2026-10-03")).toBe("sat");
    expect(weekdayKey("2026-10-04")).toBe("sun");
    expect(weekdayKey("garbage")).toBeNull();
  });
  it("looks up per-weekday slot times; null/missing = skip", () => {
    expect(slotTime(VIVIENNE, "2026-09-29", "story")).toBe("11:00");
    expect(slotTime(VIVIENNE, "2026-10-03", "reel")).toBe("16:00");
    expect(slotTime(VIVIENNE, "2026-10-04", "story")).toBe("16:00");
    expect(slotTime(VIVIENNE, "2026-10-04", "reel")).toBeNull();
    expect(slotTime(VIVIENNE, "2026-09-29", "carousel")).toBeNull();
    expect(slotTime({ mon: null }, "2026-09-28", "story")).toBeNull();
  });
});

describe("scheduleFor", () => {
  const legacy = { posting_time: "06:00:00" };
  it("without posting_schedule behaves exactly like the legacy offsets", () => {
    expect(scheduleFor(legacy, "2026-09-30", "carousel", EARLY)).toBe("2026-09-30T06:00:00.000Z");
    expect(scheduleFor(legacy, "2026-09-30", "story", EARLY)).toBe("2026-09-30T07:30:00.000Z");
    expect(scheduleFor(legacy, "2026-09-30", "reel", EARLY)).toBe("2026-09-30T14:00:00.000Z");
  });
  const viv = { posting_time: "06:00", posting_tz: TZ, posting_schedule: VIVIENNE };
  it("weekday: story 11:00 / reel 17:30 local (summer)", () => {
    expect(scheduleFor(viv, "2026-09-30", "story", EARLY)).toBe("2026-09-30T09:00:00.000Z");
    expect(scheduleFor(viv, "2026-09-30", "reel", EARLY)).toBe("2026-09-30T15:30:00.000Z");
  });
  it("weekday after DST end keeps the same LOCAL times", () => {
    expect(scheduleFor(viv, "2026-10-27", "story", EARLY)).toBe("2026-10-27T10:00:00.000Z");
    expect(scheduleFor(viv, "2026-10-27", "reel", EARLY)).toBe("2026-10-27T16:30:00.000Z");
  });
  it("Sat/Sun differ; Sun reel and any carousel are skipped (null)", () => {
    expect(scheduleFor(viv, "2026-10-03", "reel", EARLY)).toBe("2026-10-03T14:00:00.000Z");
    expect(scheduleFor(viv, "2026-10-04", "story", EARLY)).toBe("2026-10-04T14:00:00.000Z");
    expect(scheduleFor(viv, "2026-10-04", "reel", EARLY)).toBeNull();
    expect(scheduleFor(viv, "2026-09-30", "carousel", EARLY)).toBeNull();
  });
  it("defaults posting_tz to Europe/Bratislava when null", () => {
    expect(scheduleFor({ posting_time: "10:00", posting_tz: null, posting_schedule: VIVIENNE }, "2026-09-30", "story", EARLY)).toBe("2026-09-30T09:00:00.000Z");
  });
  it("past slot pushes to now + 1 min", () => {
    const now = Date.parse("2026-09-30T13:00:00.000Z");
    expect(scheduleFor(viv, "2026-09-30", "story", now)).toBe(new Date(now + 60_000).toISOString());
  });
});

describe("localDateIn", () => {
  it("uses the local calendar date, not the UTC date", () => {
    const now = Date.parse("2026-09-29T22:30:00.000Z"); // 00:30 on the 30th in Bratislava
    expect(localDateIn(TZ, now)).toBe("2026-09-30");
    expect(new Date(now).toISOString().split("T")[0]).toBe("2026-09-29");
    expect(weekdayKey(localDateIn(TZ, now))).toBe("wed");
  });
});

describe("isMissingScheduleColumn", () => {
  it("detects a missing-column error for the new columns only", () => {
    expect(isMissingScheduleColumn({ code: "42703", message: "column chs_characters.posting_tz does not exist" })).toBe(true);
    expect(isMissingScheduleColumn({ message: "Could not find the 'posting_schedule' column of 'chs_characters' in the schema cache" })).toBe(true);
    expect(isMissingScheduleColumn({ code: "42703", message: "column foo does not exist" })).toBe(false);
    expect(isMissingScheduleColumn(null)).toBe(false);
  });
});
