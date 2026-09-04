// Recovery reel duration — ONE source of truth.
//
// These constants lived in two places (the compiler and the semantic validator's auto_reel_duration
// rule) and the band change on 2026-09-04 immediately proved why that was wrong: moving one left
// the other rejecting every prompt the first produced. The validator cannot import the compiler
// (the compiler imports the validator), so the numbers live here and both import them.
//
// WHY THESE NUMBERS — measured across all 24 published reels on 2026-09-03 (MP4 mvhd header of the
// published CDN file; Meta exposes no duration field):
//
//   duration    n    max watch    cleared the 4.5s KPI
//   ~5.2s       9    3.10s        0
//   ~8.1s      14    6.36s        4
//   ~10s        1    4.37s        0
//
// Not one of the nine ~5.2s reels ever reached 4.5s watch — at the observed watch-ratio range
// (0.295–0.783, median 0.458) it is arithmetically out of reach. Every reel that did clear the
// threshold was an 8.1s file. Duration had never been a creative decision; it was whichever
// provider happened to run (Kling "5", Veo 8, Seedance "10").
//
// Band and default set by the operator on 2026-09-04.

export const REEL_DURATION_MIN_SEC = 6;
export const REEL_DURATION_MAX_SEC = 8;
export const REEL_DEFAULT_DURATION_SEC = 8;

/**
 * The QA gate's tolerance around the requested duration — providers are not sample-accurate (a
 * "6s" Veo request came back as 5.09s in production). Symmetric room around an 8s target, while a
 * 5.2s file still fails outright.
 */
export const REEL_DURATION_GATE = { minSec: 6.5, maxSec: 8.5 };
