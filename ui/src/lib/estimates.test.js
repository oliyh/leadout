import { describe, it, expect } from 'vitest';
import { normPace, segDuration, segDistanceM, blockStats, progStats } from './estimates.js';

// ── helpers ──────────────────────────────────────────────────────────────────

function timeSeg(duration, targetPace = null) {
    return { kind: 'time', duration, target_pace: targetPace };
}

function distSeg(distance, targetPace = null) {
    return { kind: 'distance', distance, target_pace: targetPace };
}

function repeatCount(repeat_count) {
    return { kind: 'repeat', exit_type: 'count', repeat_count };
}

function repeatTime(duration) {
    return { kind: 'repeat', exit_type: 'time', duration };
}

function repeatDist(distance) {
    return { kind: 'repeat', exit_type: 'distance', distance };
}

function block(segments) {
    return { segments };
}

const PACE_5KM = 300; // 5:00/km = 300 s/km

// ── normPace ─────────────────────────────────────────────────────────────────

describe('normPace', () => {
    it('returns 0 for falsy', () => {
        expect(normPace(null)).toBe(0);
        expect(normPace(undefined)).toBe(0);
        expect(normPace(0)).toBe(0);
    });

    it('extracts seconds_per_km from object', () => {
        expect(normPace({ seconds_per_km: 300 })).toBe(300);
    });

    it('returns 0 for object missing seconds_per_km', () => {
        expect(normPace({})).toBe(0);
    });

    it('converts number', () => {
        expect(normPace(330)).toBe(330);
        expect(normPace('300')).toBe(300);
    });
});

// ── segDuration ───────────────────────────────────────────────────────────────

describe('segDuration', () => {
    it('returns duration for time segment', () => {
        expect(segDuration(timeSeg(90), 0)).toBe(90);
    });

    it('uses segment target_pace for distance segment', () => {
        // 400m at 5:00/km = 400/1000 * 300 = 120s
        expect(segDuration(distSeg(400, 300), 0)).toBe(120);
    });

    it('falls back to prog pace for distance segment', () => {
        expect(segDuration(distSeg(1000), PACE_5KM)).toBe(300);
    });

    it('returns 0 for distance segment with no pace', () => {
        expect(segDuration(distSeg(1000), 0)).toBe(0);
    });

    it('returns duration for repeat time exit', () => {
        expect(segDuration(repeatTime(600), PACE_5KM)).toBe(600);
    });

    it('calculates from pace for repeat distance exit', () => {
        // 2km at 5:00/km = 600s
        expect(segDuration(repeatDist(2000), PACE_5KM)).toBe(600);
    });

    it('returns 0 for repeat count exit', () => {
        expect(segDuration(repeatCount(3), PACE_5KM)).toBe(0);
    });
});

// ── segDistanceM ──────────────────────────────────────────────────────────────

describe('segDistanceM', () => {
    it('returns distance for distance segment', () => {
        expect(segDistanceM(distSeg(800), PACE_5KM)).toBe(800);
    });

    it('calculates from pace for time segment using segment target_pace', () => {
        // 300s at 5:00/km = 300/300 * 1000 = 1000m
        expect(segDistanceM(timeSeg(300, 300), 0)).toBe(1000);
    });

    it('calculates from prog pace for time segment', () => {
        // 150s at 5:00/km = 500m
        expect(segDistanceM(timeSeg(150), PACE_5KM)).toBe(500);
    });

    it('returns 0 for time segment with no pace', () => {
        expect(segDistanceM(timeSeg(300), 0)).toBe(0);
    });

    it('returns 0 for repeat segments', () => {
        expect(segDistanceM(repeatCount(3), PACE_5KM)).toBe(0);
        expect(segDistanceM(repeatTime(300), PACE_5KM)).toBe(0);
        expect(segDistanceM(repeatDist(1000), PACE_5KM)).toBe(0);
    });
});

// ── blockStats ────────────────────────────────────────────────────────────────

describe('blockStats', () => {
    it('returns zeros for empty block', () => {
        expect(blockStats(block([]), PACE_5KM)).toEqual({ durationSecs: 0, distanceM: 0 });
    });

    it('sums time segments', () => {
        const b = block([timeSeg(60), timeSeg(120)]);
        expect(blockStats(b, PACE_5KM)).toEqual({ durationSecs: 180, distanceM: 600 });
        // 60s + 120s = 180s; (60+120)/300*1000 = 600m
    });

    it('sums distance segments', () => {
        const b = block([distSeg(400), distSeg(800)]);
        // 1200m total; duration = 1200/1000 * 300 = 360s
        expect(blockStats(b, PACE_5KM)).toEqual({ durationSecs: 360, distanceM: 1200 });
    });

    describe('count repeat', () => {
        it('multiplies enclosed duration and distance', () => {
            // 60s time seg then ×3 repeat
            const b = block([timeSeg(60), repeatCount(3)]);
            // 60s * 3 = 180s; 200m * 3 = 600m (60s at 300 s/km = 200m)
            expect(blockStats(b, PACE_5KM)).toEqual({ durationSecs: 180, distanceM: 600 });
        });

        it('handles multiple segments before repeat', () => {
            const b = block([timeSeg(60), distSeg(400), repeatCount(2)]);
            // enclosed: 60s time → 200m; 400m dist → 120s (400/1000×300); total enclosed: 180s, 600m
            // ×2: 360s, 1200m
            expect(blockStats(b, PACE_5KM)).toEqual({ durationSecs: 360, distanceM: 1200 });
        });

        it('handles segments after repeat', () => {
            const b = block([timeSeg(60), repeatCount(3), timeSeg(30)]);
            // 60s×3 = 180s; then 30s more
            // 200m×3 = 600m; then 100m more
            expect(blockStats(b, PACE_5KM)).toEqual({ durationSecs: 210, distanceM: 700 });
        });

        it('handles multiple repeats in one block', () => {
            const b = block([timeSeg(60), repeatCount(2), timeSeg(30), repeatCount(3)]);
            // first repeat: 60s×2=120s, 200m×2=400m
            // second repeat: 30s×3=90s, 100m×3=300m
            expect(blockStats(b, PACE_5KM)).toEqual({ durationSecs: 210, distanceM: 700 });
        });
    });

    describe('time repeat', () => {
        it('uses repeat duration and scales enclosed distance proportionally', () => {
            // 60s time seg (=200m at 5/km), repeat for 300s total
            const b = block([timeSeg(60), repeatTime(300)]);
            // duration = 300s; distance = 200m * (300/60) = 1000m
            expect(blockStats(b, PACE_5KM)).toEqual({ durationSecs: 300, distanceM: 1000 });
        });

        it('falls back to pace when enclosed has no duration', () => {
            // repeat time exit with no segments before it
            const b = block([repeatTime(300)]);
            // enclosedSecs=0, enclosedDist=0 → fallback: 300s / 300 * 1000 = 1000m
            expect(blockStats(b, PACE_5KM)).toEqual({ durationSecs: 300, distanceM: 1000 });
        });
    });

    describe('distance repeat', () => {
        it('uses repeat distance and scales enclosed duration proportionally', () => {
            // 200m dist seg (=60s at 5/km), repeat for 600m total
            const b = block([distSeg(200), repeatDist(600)]);
            // distanceM = 600; durationSecs = 60s * (600/200) = 180s
            expect(blockStats(b, PACE_5KM)).toEqual({ durationSecs: 180, distanceM: 600 });
        });

        it('falls back to pace when enclosed has no distance', () => {
            // repeat distance with no segments before it (enclosedDist=0)
            const b = block([repeatDist(1000)]);
            // distanceM = 1000; durationSecs = 1000/1000 * 300 = 300s
            expect(blockStats(b, PACE_5KM)).toEqual({ durationSecs: 300, distanceM: 1000 });
        });
    });

    it('works without any pace (no estimation possible)', () => {
        // time segment only — can compute duration but not distance
        const b = block([timeSeg(120)]);
        expect(blockStats(b, 0)).toEqual({ durationSecs: 120, distanceM: 0 });
    });

    it('accepts pace as object with seconds_per_km', () => {
        const b = block([distSeg(1000)]);
        expect(blockStats(b, { seconds_per_km: 300 })).toEqual({ durationSecs: 300, distanceM: 1000 });
    });
});

// ── progStats ─────────────────────────────────────────────────────────────────

describe('progStats', () => {
    it('returns zeros for empty programme', () => {
        expect(progStats([], PACE_5KM)).toEqual({ durationSecs: 0, distanceM: 0 });
    });

    it('sums a single block', () => {
        const blocks = [block([timeSeg(300)])];
        expect(progStats(blocks, PACE_5KM)).toEqual({ durationSecs: 300, distanceM: 1000 });
    });

    it('sums multiple blocks', () => {
        const blocks = [
            block([timeSeg(300)]),
            block([distSeg(800)]),
        ];
        // 300s + 240s = 540s; 1000m + 800m = 1800m
        expect(progStats(blocks, PACE_5KM)).toEqual({ durationSecs: 540, distanceM: 1800 });
    });

    it('handles blocks with repeats', () => {
        const blocks = [
            block([timeSeg(60), repeatCount(5)]),  // 60s×5=300s, 200m×5=1000m
            block([distSeg(400), repeatCount(4)]), // 120s×4=480s, 400m×4=1600m
        ];
        // 400m at 5:00/km = 120s (400/1000×300); total: 780s, 2600m
        expect(progStats(blocks, PACE_5KM)).toEqual({ durationSecs: 780, distanceM: 2600 });
    });
});
