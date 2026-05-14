// Pure presentation helpers — no side-effects, no signals.

// Formats whole seconds as "m:ss" (e.g. 125 → "2m5s", 30 → "30s").
export function fmtDuration(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m === 0) return `${s}s`;
    return s === 0 ? `${m}m` : `${m}m${s}s`;
}

// Formats a distance in metres. Under 1 km returns "400m"; 1 km+ returns "5km" or "5.2km".
export function fmtDistance(m) {
    if (m <= 0) return null;
    if (m >= 1000) {
        const km = m / 1000;
        return `${Number.isInteger(km) ? km : km.toFixed(1)}km`;
    }
    return `${m}m`;
}

// Formats whole seconds/km as "m:ss" pace string (e.g. 330 → "5:30").
export function fmtPace(sec) {
    const n = Number(sec) || 0;
    const m = Math.floor(n / 60);
    const s = String(n % 60).padStart(2, '0');
    return `${m}:${s}`;
}

// Parses "m:ss" or a bare number of seconds into an integer seconds/km value.
export function parsePace(str) {
    const parts = str.split(':');
    if (parts.length === 2) return Number(parts[0]) * 60 + Number(parts[1]);
    return Number(str);
}

// Generates the primary label shown on a segment strip chip.
export function segLabel(seg) {
    if (seg.kind === 'repeat') {
        if (seg.exit_type === 'count')    return `×${seg.repeat_count ?? '?'}`;
        if (seg.exit_type === 'time')     return fmtDuration(seg.duration ?? 0);
        if (seg.exit_type === 'distance') return `${seg.distance ?? '?'}m`;
    }
    if (seg.kind === 'distance') return `${seg.distance ?? '?'}m`;
    return fmtDuration(seg.duration ?? 0);
}
