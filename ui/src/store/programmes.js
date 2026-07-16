import { signal, computed } from '@preact/signals';
import { api } from './api.js';

export const programmes = signal([]);
export const selectedId = signal(null);
export const saving = signal(false);
export const lastSaved = signal(null);
export const saveError = signal(null);
export const pendingSync = signal(new Set()); // IDs with un-pushed local changes

export const selected = computed(() =>
    programmes.value.find(p => p.id === selectedId.value) ?? null
);

// ── Undo / Redo ───────────────────────────────────────────────────────────────

const MAX_HISTORY = 50;
const MERGE_MS = 2000; // consecutive same-action edits within this window are merged

// Map<progId, Array<{description, snapshot, ts}>>
const undoStacks = signal(new Map());
const redoStacks = signal(new Map());

export const undoLabel = computed(() => {
    const stack = undoStacks.value.get(selectedId.value) ?? [];
    return stack.length ? stack[stack.length - 1].description : null;
});

export const redoLabel = computed(() => {
    const stack = redoStacks.value.get(selectedId.value) ?? [];
    return stack.length ? stack[stack.length - 1].description : null;
});

function pushHistory(progId, description, snapshot) {
    const existing = undoStacks.value.get(progId) ?? [];
    const last = existing[existing.length - 1];
    if (last && last.description === description && Date.now() - last.ts < MERGE_MS) return;

    const stack = [...existing, { description, snapshot, ts: Date.now() }];
    const nextUndo = new Map(undoStacks.value);
    nextUndo.set(progId, stack.length > MAX_HISTORY ? stack.slice(-MAX_HISTORY) : stack);
    undoStacks.value = nextUndo;

    const nextRedo = new Map(redoStacks.value);
    nextRedo.set(progId, []);
    redoStacks.value = nextRedo;
}

export function undo(progId) {
    const stack = [...(undoStacks.value.get(progId) ?? [])];
    if (!stack.length) return;
    const entry = stack.pop();
    const current = programmes.value.find(p => p.id === progId);
    if (!current) return;

    const nextRedo = new Map(redoStacks.value);
    const redoStack = [...(nextRedo.get(progId) ?? []), { ...entry, snapshot: current }];
    nextRedo.set(progId, redoStack.length > MAX_HISTORY ? redoStack.slice(-MAX_HISTORY) : redoStack);
    redoStacks.value = nextRedo;

    const nextUndo = new Map(undoStacks.value);
    nextUndo.set(progId, stack);
    undoStacks.value = nextUndo;

    programmes.value = programmes.value.map(p => p.id === progId ? entry.snapshot : p);
    pendingSync.value = new Set([...pendingSync.value, progId]);
    toStorage();
    scheduleSave(progId);
}

export function redo(progId) {
    const stack = [...(redoStacks.value.get(progId) ?? [])];
    if (!stack.length) return;
    const entry = stack.pop();
    const current = programmes.value.find(p => p.id === progId);
    if (!current) return;

    const nextUndo = new Map(undoStacks.value);
    const undoStack = [...(nextUndo.get(progId) ?? []), { ...entry, snapshot: current }];
    nextUndo.set(progId, undoStack.length > MAX_HISTORY ? undoStack.slice(-MAX_HISTORY) : undoStack);
    undoStacks.value = nextUndo;

    const nextRedo = new Map(redoStacks.value);
    nextRedo.set(progId, stack);
    redoStacks.value = nextRedo;

    programmes.value = programmes.value.map(p => p.id === progId ? entry.snapshot : p);
    pendingSync.value = new Set([...pendingSync.value, progId]);
    toStorage();
    scheduleSave(progId);
}

// ── LocalStorage ──────────────────────────────────────────────────────────────

const LS_KEY = 'leadout:v1';

function fromStorage() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}'); }
    catch { return {}; }
}

function toStorage() {
    try {
        localStorage.setItem(LS_KEY, JSON.stringify({
            programmes: programmes.value,
            pending: [...pendingSync.value],
        }));
    } catch {}
}

// ── Debounced server save ─────────────────────────────────────────────────────

let saveTimer = null;

function scheduleSave(progId) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => flush(progId), 600);
}

async function flush(progId) {
    const prog = programmes.value.find(p => p.id === progId);
    if (!prog) return;
    saving.value = true;
    saveError.value = null;
    try {
        await api.put(progId, prog);
        lastSaved.value = new Date();
        const next = new Set(pendingSync.value);
        next.delete(progId);
        pendingSync.value = next;
        toStorage();
    } catch (err) {
        saveError.value = err.message;
    } finally {
        saving.value = false;
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function newId() { return crypto.randomUUID(); }

function mutate(progId, fn, description) {
    const current = programmes.value.find(p => p.id === progId);
    if (current) pushHistory(progId, description, current);
    programmes.value = programmes.value.map(p => p.id === progId ? fn(p) : p);
    pendingSync.value = new Set([...pendingSync.value, progId]);
    toStorage();
    scheduleSave(progId);
}

function makeSegment(data, position) {
    const kind = data.kind || 'time';
    if (kind === 'repeat') {
        const exit_type = data.exit_type || 'count';
        return {
            id:           data.id || newId(),
            name:         'Repeat',
            kind:         'repeat',
            exit_type,
            repeat_count: exit_type === 'count' ? (Number(data.repeat_count) || 3) : null,
            duration:     exit_type === 'time'  ? (Number(data.duration)     || 600) : null,
            distance:     exit_type === 'distance' ? (Number(data.distance)  || null) : null,
            target_pace:  null,
            position,
        };
    }
    if (kind === 'line') {
        return {
            id:          data.id || newId(),
            name:        data.name || 'Finish line',
            kind:        'line',
            p1_lat:      data.p1_lat != null ? Number(data.p1_lat) : null,
            p1_lng:      data.p1_lng != null ? Number(data.p1_lng) : null,
            p2_lat:      data.p2_lat != null ? Number(data.p2_lat) : null,
            p2_lng:      data.p2_lng != null ? Number(data.p2_lng) : null,
            target_pace: data.target_pace ? Number(data.target_pace) : null,
            position,
        };
    }
    return {
        id:          data.id || newId(),
        name:        data.name || 'Segment',
        kind,
        duration:    kind === 'distance' ? null : (Number(data.duration) || 60),
        distance:    kind === 'distance' ? (Number(data.distance) || null) : null,
        target_pace: data.target_pace ? Number(data.target_pace) : null,
        position,
    };
}

// ── Open a programme from an external source (e.g. ChannelPage) ──────────────

export function openExternalProgramme(prog) {
    const existing = programmes.value.find(p => p.id === prog.id);
    if (!existing) {
        programmes.value = [...programmes.value, prog];
    }
    selectedId.value = prog.id;
}

// ── Programme CRUD ────────────────────────────────────────────────────────────

export async function deleteProgramme(id) {
    await api.remove(id);
    programmes.value = programmes.value.filter(p => p.id !== id);
    const next = new Set(pendingSync.value);
    next.delete(id);
    pendingSync.value = next;
    toStorage();
    if (selectedId.value === id) selectedId.value = null;
}

function describeProgPatch(patch) {
    const keys = Object.keys(patch);
    if (keys.includes('name')) return 'rename';
    if (keys.includes('scheduled_date')) return 'update date';
    if (keys.includes('pace_assumption')) return 'update pace';
    return 'update programme';
}

export function updateProgramme(id, patch) {
    mutate(id, p => ({ ...p, ...patch }), describeProgPatch(patch));
}

// ── Blocks ────────────────────────────────────────────────────────────────────

export function addBlock(progId, data) {
    const block = {
        id: newId(),
        name: data.name || 'Block',
        segments: (data.segments || []).map((s, i) => makeSegment(s, i)),
        position: 0,
    };
    mutate(progId, p => ({
        ...p,
        blocks: [...p.blocks, { ...block, position: p.blocks.length }],
    }), 'add block');
    return block;
}

export function updateBlock(progId, blockId, patch, description = 'rename block') {
    mutate(progId, p => ({
        ...p,
        blocks: p.blocks.map(b => b.id === blockId ? { ...b, ...patch } : b),
    }), description);
}

export function deleteBlock(progId, blockId) {
    mutate(progId, p => ({
        ...p,
        blocks: p.blocks.filter(b => b.id !== blockId).map((b, i) => ({ ...b, position: i })),
    }), 'delete block');
}

export function cloneBlock(progId, blockId) {
    mutate(progId, p => {
        const idx = p.blocks.findIndex(b => b.id === blockId);
        if (idx === -1) return p;
        const src = p.blocks[idx];
        const copy = {
            ...src,
            id: newId(),
            segments: src.segments.map(s => ({ ...s, id: newId() })),
        };
        const blocks = [...p.blocks];
        blocks.splice(idx + 1, 0, copy);
        return { ...p, blocks: blocks.map((b, i) => ({ ...b, position: i })) };
    }, 'clone block');
}

export function moveBlock(progId, blockId, direction) {
    mutate(progId, p => {
        const blocks = [...p.blocks];
        const idx = blocks.findIndex(b => b.id === blockId);
        const to = direction === 'up' ? idx - 1 : idx + 1;
        if (to < 0 || to >= blocks.length) return p;
        [blocks[idx], blocks[to]] = [blocks[to], blocks[idx]];
        return { ...p, blocks: blocks.map((b, i) => ({ ...b, position: i })) };
    }, `move block ${direction}`);
}

// ── Segments ──────────────────────────────────────────────────────────────────

export function addSegment(progId, blockId, data) {
    const seg = makeSegment(data, 0);
    mutate(progId, p => ({
        ...p,
        blocks: p.blocks.map(b =>
            b.id !== blockId ? b : {
                ...b,
                segments: [...b.segments, { ...seg, position: b.segments.length }],
            }
        ),
    }), 'add segment');
    return seg;
}

export function updateSegment(progId, blockId, segId, patch, description = 'update segment') {
    mutate(progId, p => ({
        ...p,
        blocks: p.blocks.map(b =>
            b.id !== blockId ? b : {
                ...b,
                segments: b.segments.map(s => s.id === segId ? { ...s, ...patch } : s),
            }
        ),
    }), description);
}

export function deleteSegment(progId, blockId, segId) {
    mutate(progId, p => ({
        ...p,
        blocks: p.blocks.map(b =>
            b.id !== blockId ? b : {
                ...b,
                segments: b.segments
                    .filter(s => s.id !== segId)
                    .map((s, i) => ({ ...s, position: i })),
            }
        ),
    }), 'delete segment');
}

export function moveSegment(progId, blockId, segId, direction) {
    mutate(progId, p => ({
        ...p,
        blocks: p.blocks.map(b => {
            if (b.id !== blockId) return b;
            const segs = [...b.segments];
            const idx = segs.findIndex(s => s.id === segId);
            const to = direction === 'left' ? idx - 1 : idx + 1;
            if (to < 0 || to >= segs.length) return b;
            [segs[idx], segs[to]] = [segs[to], segs[idx]];
            return { ...b, segments: segs.map((s, i) => ({ ...s, position: i })) };
        }),
    }), 'reorder segment');
}
