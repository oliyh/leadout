import { describe, it, expect } from 'vitest';
import { fmtDuration, fmtDistance, fmtPace, parsePace, segLabel } from './format.js';

// ── fmtDuration ───────────────────────────────────────────────────────────────

describe('fmtDuration', () => {
    it('formats seconds only', () => {
        expect(fmtDuration(30)).toBe('30s');
        expect(fmtDuration(1)).toBe('1s');
        expect(fmtDuration(59)).toBe('59s');
    });

    it('formats whole minutes', () => {
        expect(fmtDuration(60)).toBe('1m');
        expect(fmtDuration(120)).toBe('2m');
        expect(fmtDuration(3600)).toBe('60m');
    });

    it('formats minutes and seconds', () => {
        expect(fmtDuration(90)).toBe('1m30s');
        expect(fmtDuration(125)).toBe('2m5s');
        expect(fmtDuration(3661)).toBe('61m1s');
    });

    it('formats zero', () => {
        expect(fmtDuration(0)).toBe('0s');
    });
});

// ── fmtDistance ───────────────────────────────────────────────────────────────

describe('fmtDistance', () => {
    it('returns null for zero or negative', () => {
        expect(fmtDistance(0)).toBeNull();
        expect(fmtDistance(-100)).toBeNull();
    });

    it('formats metres under 1 km', () => {
        expect(fmtDistance(400)).toBe('400m');
        expect(fmtDistance(999)).toBe('999m');
        expect(fmtDistance(1)).toBe('1m');
    });

    it('formats whole kilometres', () => {
        expect(fmtDistance(1000)).toBe('1km');
        expect(fmtDistance(5000)).toBe('5km');
        expect(fmtDistance(10000)).toBe('10km');
    });

    it('formats fractional kilometres to 1 decimal place', () => {
        expect(fmtDistance(1500)).toBe('1.5km');
        expect(fmtDistance(2400)).toBe('2.4km');
        expect(fmtDistance(1100)).toBe('1.1km');
    });

    it('drops trailing zero from decimal', () => {
        // 2000m = 2.0km — should show "2km" not "2.0km"
        expect(fmtDistance(2000)).toBe('2km');
    });
});

// ── fmtPace ───────────────────────────────────────────────────────────────────

describe('fmtPace', () => {
    it('formats whole minutes', () => {
        expect(fmtPace(300)).toBe('5:00');
        expect(fmtPace(360)).toBe('6:00');
    });

    it('pads seconds to two digits', () => {
        expect(fmtPace(305)).toBe('5:05');
        expect(fmtPace(301)).toBe('5:01');
        expect(fmtPace(330)).toBe('5:30');
    });

    it('formats zero', () => {
        expect(fmtPace(0)).toBe('0:00');
    });

    it('handles sub-minute pace (unusual but valid)', () => {
        expect(fmtPace(45)).toBe('0:45');
    });
});

// ── parsePace ─────────────────────────────────────────────────────────────────

describe('parsePace', () => {
    it('parses m:ss format', () => {
        expect(parsePace('5:00')).toBe(300);
        expect(parsePace('5:30')).toBe(330);
        expect(parsePace('5:05')).toBe(305);
        expect(parsePace('6:00')).toBe(360);
    });

    it('parses bare seconds', () => {
        expect(parsePace('330')).toBe(330);
        expect(parsePace('300')).toBe(300);
    });

    it('round-trips with fmtPace', () => {
        expect(parsePace(fmtPace(330))).toBe(330);
        expect(parsePace(fmtPace(305))).toBe(305);
        expect(parsePace(fmtPace(360))).toBe(360);
    });
});

// ── segLabel ──────────────────────────────────────────────────────────────────

describe('segLabel', () => {
    it('formats time segment as duration', () => {
        expect(segLabel({ kind: 'time', duration: 90 })).toBe('1m30s');
        expect(segLabel({ kind: 'time', duration: 60 })).toBe('1m');
        expect(segLabel({ kind: 'time', duration: 30 })).toBe('30s');
    });

    it('formats distance segment as metres', () => {
        expect(segLabel({ kind: 'distance', distance: 400 })).toBe('400m');
        expect(segLabel({ kind: 'distance', distance: 1000 })).toBe('1000m');
    });

    it('formats count repeat as ×N', () => {
        expect(segLabel({ kind: 'repeat', exit_type: 'count', repeat_count: 5 })).toBe('×5');
        expect(segLabel({ kind: 'repeat', exit_type: 'count', repeat_count: 1 })).toBe('×1');
    });

    it('formats time repeat as duration', () => {
        expect(segLabel({ kind: 'repeat', exit_type: 'time', duration: 300 })).toBe('5m');
    });

    it('formats distance repeat as metres', () => {
        expect(segLabel({ kind: 'repeat', exit_type: 'distance', distance: 800 })).toBe('800m');
    });

    it('formats line segment as "Line"', () => {
        expect(segLabel({ kind: 'line', p1_lat: 51.5074, p1_lng: -0.1278, p2_lat: 51.5075, p2_lng: -0.1280 })).toBe('Line');
    });

    it('shows ? for missing values', () => {
        expect(segLabel({ kind: 'repeat', exit_type: 'count' })).toBe('×?');
        expect(segLabel({ kind: 'distance' })).toBe('?m');
    });
});
