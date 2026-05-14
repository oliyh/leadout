import { describe, it, expect } from 'vitest';
import { parsePace, paceToDigits, fmtPaceDigits } from './pace.js';

describe('fmtPaceDigits', () => {
    it('empty string returns empty', () => {
        expect(fmtPaceDigits('')).toBe('');
    });

    it('single digit expands to M:00', () => {
        expect(fmtPaceDigits('3')).toBe('3:00');
        expect(fmtPaceDigits('5')).toBe('5:00');
    });

    it('two digits give M:S0', () => {
        expect(fmtPaceDigits('34')).toBe('3:40');
        expect(fmtPaceDigits('53')).toBe('5:30');
        expect(fmtPaceDigits('40')).toBe('4:00');
    });

    it('three digits give M:SS', () => {
        expect(fmtPaceDigits('345')).toBe('3:45');
        expect(fmtPaceDigits('530')).toBe('5:30');
        expect(fmtPaceDigits('600')).toBe('6:00');
    });

    it('four digits give MM:SS', () => {
        expect(fmtPaceDigits('3456')).toBe('34:56');
        expect(fmtPaceDigits('1000')).toBe('10:00');
        expect(fmtPaceDigits('1030')).toBe('10:30');
    });
});

describe('paceToDigits', () => {
    it('null / zero returns empty string', () => {
        expect(paceToDigits(null)).toBe('');
        expect(paceToDigits(0)).toBe('');
    });

    it('converts whole minutes correctly', () => {
        expect(paceToDigits(180)).toBe('300');  // 3:00
        expect(paceToDigits(300)).toBe('500');  // 5:00
        expect(paceToDigits(600)).toBe('1000'); // 10:00
    });

    it('pads seconds with leading zero', () => {
        expect(paceToDigits(185)).toBe('305');  // 3:05
        expect(paceToDigits(309)).toBe('509');  // 5:09
    });

    it('converts minutes and seconds correctly', () => {
        expect(paceToDigits(330)).toBe('530');  // 5:30
        expect(paceToDigits(225)).toBe('345');  // 3:45
    });
});

describe('parsePace', () => {
    it('parses m:ss format to seconds', () => {
        expect(parsePace('3:00')).toBe(180);
        expect(parsePace('5:30')).toBe(330);
        expect(parsePace('3:45')).toBe(225);
        expect(parsePace('10:00')).toBe(600);
    });

    it('returns null for strings without a colon', () => {
        expect(parsePace('330')).toBeNull();
        expect(parsePace('')).toBeNull();
    });
});

describe('round-trip: paceToDigits → fmtPaceDigits → parsePace', () => {
    const cases = [180, 225, 270, 330, 600, 630];
    cases.forEach(secs => {
        it(`round-trips ${secs}s`, () => {
            expect(parsePace(fmtPaceDigits(paceToDigits(secs)))).toBe(secs);
        });
    });
});
