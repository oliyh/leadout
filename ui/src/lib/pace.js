// Parse a "m:ss" formatted pace string to seconds-per-km.
export function parsePace(str) {
    const parts = str.split(':');
    if (parts.length === 2) return Number(parts[0]) * 60 + Number(parts[1]);
    return null;
}

// Convert stored seconds-per-km to the raw digit string used as input state.
// e.g. 330 (5:30/km) → "530"
export function paceToDigits(sec) {
    if (!sec) return '';
    return `${Math.floor(sec / 60)}${String(sec % 60).padStart(2, '0')}`;
}

// Format a digit string as a pace display value.
// "3" → "3:00", "34" → "3:40", "345" → "3:45", "3456" → "34:56"
export function fmtPaceDigits(digits) {
    if (!digits) return '';
    if (digits.length === 1) return `${digits}:00`;
    if (digits.length === 2) return `${digits[0]}:${digits[1]}0`;
    if (digits.length === 3) return `${digits[0]}:${digits.slice(1)}`;
    return `${digits.slice(0, -2)}:${digits.slice(-2)}`;
}
