// Unit tests for the contract validators in spec/contract.js.
// Covers the line segment kind added alongside geo segment support.

import { describe, it, expect } from 'vitest';
import { assertSegmentShape } from '../../../spec/contract.js';

describe('assertSegmentShape — line kind', () => {
    const validLine = {
        name:        'Start/Finish',
        kind:        'line',
        p1_lat:      51.5074,
        p1_lng:      -0.1278,
        p2_lat:      51.5075,
        p2_lng:      -0.1280,
        target_pace: null,
    };

    it('accepts a valid line segment', () => {
        expect(() => assertSegmentShape(validLine)).not.toThrow();
    });

    it('accepts a line segment with target_pace set', () => {
        expect(() => assertSegmentShape({ ...validLine, target_pace: 330 })).not.toThrow();
    });

    for (const field of ['p1_lat', 'p1_lng', 'p2_lat', 'p2_lng']) {
        it(`rejects line segment missing ${field}`, () => {
            const seg = { ...validLine };
            delete seg[field];
            expect(() => assertSegmentShape(seg)).toThrow(field);
        });

        it(`rejects line segment with ${field} as string`, () => {
            expect(() => assertSegmentShape({ ...validLine, [field]: '51.5074' })).toThrow(field);
        });
    }
});

describe('assertSegmentShape — kind validation', () => {
    it("rejects unknown kind 'geo'", () => {
        expect(() => assertSegmentShape({ name: 'x', kind: 'geo' })).toThrow("'geo'");
    });

    it("still accepts time, distance, repeat kinds", () => {
        expect(() => assertSegmentShape({ name: 'x', kind: 'time',     duration: 60 })).not.toThrow();
        expect(() => assertSegmentShape({ name: 'x', kind: 'distance', distance: 400 })).not.toThrow();
        expect(() => assertSegmentShape({ name: 'x', kind: 'repeat', exit_type: 'count', repeat_count: 3 })).not.toThrow();
    });
});
