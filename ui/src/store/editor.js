import { signal } from '@preact/signals';

// { progId, blockId, segId } — identifies the selected segment for inline editing
export const activeSegment = signal(null);

export function selectSegment(progId, blockId, segId) {
    const cur = activeSegment.value;
    if (cur?.progId === progId && cur?.blockId === blockId && cur?.segId === segId) {
        activeSegment.value = null;
    } else {
        activeSegment.value = { progId, blockId, segId };
    }
}

export function clearSelection() {
    activeSegment.value = null;
}
