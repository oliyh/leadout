// Generate a pyramid block: min→max→min in steps of inc, each step paired with a recovery.
// e.g. min=1m, max=3m, inc=1m → [1m effort, 1m rec, 2m effort, 2m rec, 3m effort, 3m rec, 2m effort, 2m rec, 1m effort, 1m rec]
export function pyramidSegments({ minSec, maxSec, incSec, effortName, recoveryName }) {
    const steps = [];
    for (let d = minSec; d <= maxSec; d += incSec) steps.push(d);
    // ascending then descending (omit top to avoid repeating it)
    const durations = [...steps, ...steps.slice(0, -1).reverse()];

    return durations.flatMap((d, i) => [
        { name: effortName || 'Effort', kind: 'time', duration: d },
        { name: recoveryName || 'Recovery', kind: 'time', duration: Math.round(d * 0.5) },
    ]);
}

export function pyramidPreview({ minSec, maxSec, incSec, effortName, recoveryName }) {
    const segs = pyramidSegments({ minSec, maxSec, incSec, effortName, recoveryName });
    const totalSec = segs.reduce((sum, s) => sum + s.duration, 0);
    const totalMin = Math.round(totalSec / 60);
    return `${segs.length} segments · ~${totalMin} min total`;
}
