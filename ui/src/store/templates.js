function preview(segs) {
    const totalSec = segs.reduce((sum, s) => sum + s.duration, 0);
    return `${segs.length} segments · ~${Math.round(totalSec / 60)} min total`;
}

// ── Pyramid ───────────────────────────────────────────────────────────────────
// Effort pyramids min→max→min; recovery is constant at minSec throughout.

export function pyramidSegments({ minSec, maxSec, incSec, effortName, recoveryName }) {
    const steps = [];
    for (let d = minSec; d <= maxSec; d += incSec) steps.push(d);
    const efforts = [...steps, ...steps.slice(0, -1).reverse()];
    return efforts.flatMap(d => [
        { name: effortName || 'Effort', kind: 'time', duration: d },
        { name: recoveryName || 'Recovery', kind: 'time', duration: minSec },
    ]);
}

export function pyramidPreview(params) {
    return preview(pyramidSegments(params));
}

// ── 3-2-1 Fartlek ─────────────────────────────────────────────────────────────
// Repeating descending ladder: 3 min effort / 3 min easy, 2/2, 1/1.
// Each set is one block; reps controls how many sets.

export function fartlek321Segments({ reps = 1, effortName = 'Hard', recoveryName = 'Easy' }) {
    const ladder = [3, 2, 1];
    const set = ladder.flatMap(m => [
        { name: effortName, kind: 'time', duration: m * 60 },
        { name: recoveryName, kind: 'time', duration: m * 60 },
    ]);
    return Array.from({ length: reps }, () => set).flat();
}

export function fartlek321Preview({ reps }) {
    return preview(fartlek321Segments({ reps }));
}

// ── Mona Fartlek ──────────────────────────────────────────────────────────────
// Classic Swedish fartlek set: 2×6min, 4×3min, 4×2min, 4×1min,
// each effort matched by equal recovery.

export function monaFartlekSegments({ effortName = 'Hard', recoveryName = 'Easy' } = {}) {
    const sets = [
        [2, 6], [4, 3], [4, 2], [4, 1],
    ];
    return sets.flatMap(([reps, mins]) =>
        Array.from({ length: reps }, () => [
            { name: effortName, kind: 'time', duration: mins * 60 },
            { name: recoveryName, kind: 'time', duration: mins * 60 },
        ]).flat()
    );
}

export function monaFartlekPreview() {
    return preview(monaFartlekSegments());
}
