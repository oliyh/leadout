export function normPace(val) {
    if (!val) return 0;
    if (typeof val === 'object') return val.seconds_per_km ?? 0;
    return Number(val) || 0;
}

export function segDuration(seg, pace) {
    if (seg.kind === 'time') return seg.duration ?? 0;
    if (seg.kind === 'distance') {
        const p = normPace(seg.target_pace) || normPace(pace);
        if (p > 0 && seg.distance) return Math.round(seg.distance / 1000 * p);
        return 0;
    }
    if (seg.kind === 'repeat') {
        if (seg.exit_type === 'time') return seg.duration ?? 0;
        if (seg.exit_type === 'distance') {
            const p = normPace(pace);
            if (p > 0 && seg.distance) return Math.round(seg.distance / 1000 * p);
        }
        return 0;
    }
    return 0;
}

export function segDistanceM(seg, pace) {
    if (seg.kind === 'distance') return seg.distance ?? 0;
    if (seg.kind === 'time') {
        const p = normPace(seg.target_pace) || normPace(pace);
        if (p > 0 && seg.duration) return Math.round(seg.duration / p * 1000);
    }
    return 0;
}

// Returns { durationSecs, distanceM } for a single block.
export function blockStats(block, pace) {
    let durationSecs = 0;
    let distanceM = 0;
    let enclosedSecs = 0;
    let enclosedDist = 0;

    for (const seg of block.segments) {
        if (seg.kind !== 'repeat') {
            const dur = segDuration(seg, pace);
            const dist = segDistanceM(seg, pace);
            durationSecs += dur;
            distanceM += dist;
            enclosedSecs += dur;
            enclosedDist += dist;
        } else {
            durationSecs -= enclosedSecs;
            distanceM -= enclosedDist;

            if (seg.exit_type === 'count') {
                const n = seg.repeat_count || 1;
                durationSecs += enclosedSecs * n;
                distanceM += enclosedDist * n;
            } else if (seg.exit_type === 'time') {
                const dur = seg.duration ?? 0;
                durationSecs += dur;
                if (enclosedSecs > 0) {
                    distanceM += Math.round(enclosedDist * (dur / enclosedSecs));
                } else {
                    const p = normPace(pace);
                    if (p > 0) distanceM += Math.round(dur / p * 1000);
                }
            } else if (seg.exit_type === 'distance') {
                const dist = seg.distance ?? 0;
                distanceM += dist;
                if (enclosedDist > 0) {
                    durationSecs += Math.round(enclosedSecs * (dist / enclosedDist));
                } else {
                    const p = normPace(pace);
                    if (p > 0 && dist) durationSecs += Math.round(dist / 1000 * p);
                }
            }

            enclosedSecs = 0;
            enclosedDist = 0;
        }
    }

    return { durationSecs, distanceM };
}

// Returns { durationSecs, distanceM } summed across all blocks.
export function progStats(blocks, pace) {
    return blocks.reduce(
        (acc, block) => {
            const s = blockStats(block, pace);
            return { durationSecs: acc.durationSecs + s.durationSecs, distanceM: acc.distanceM + s.distanceM };
        },
        { durationSecs: 0, distanceM: 0 }
    );
}
