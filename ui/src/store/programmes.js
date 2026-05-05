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

function mutate(progId, fn) {
    programmes.value = programmes.value.map(p => p.id === progId ? fn(p) : p);
    pendingSync.value = new Set([...pendingSync.value, progId]);
    toStorage();
    scheduleSave(progId);
}

function makeSegment(data, position) {
    return {
        id:          data.id || newId(),
        name:        data.name || 'Segment',
        kind:        data.kind || 'time',
        duration:    data.kind === 'distance' ? null : (Number(data.duration) || 60),
        distance:    data.kind === 'distance' ? (Number(data.distance) || null) : null,
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

export function updateProgramme(id, patch) {
    mutate(id, p => ({ ...p, ...patch }));
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
    }));
    return block;
}

export function updateBlock(progId, blockId, patch) {
    mutate(progId, p => ({
        ...p,
        blocks: p.blocks.map(b => b.id === blockId ? { ...b, ...patch } : b),
    }));
}

export function deleteBlock(progId, blockId) {
    mutate(progId, p => ({
        ...p,
        blocks: p.blocks.filter(b => b.id !== blockId).map((b, i) => ({ ...b, position: i })),
    }));
}

export function moveBlock(progId, blockId, direction) {
    mutate(progId, p => {
        const blocks = [...p.blocks];
        const idx = blocks.findIndex(b => b.id === blockId);
        const to = direction === 'up' ? idx - 1 : idx + 1;
        if (to < 0 || to >= blocks.length) return p;
        [blocks[idx], blocks[to]] = [blocks[to], blocks[idx]];
        return { ...p, blocks: blocks.map((b, i) => ({ ...b, position: i })) };
    });
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
    }));
    return seg;
}

export function updateSegment(progId, blockId, segId, patch) {
    mutate(progId, p => ({
        ...p,
        blocks: p.blocks.map(b =>
            b.id !== blockId ? b : {
                ...b,
                segments: b.segments.map(s => s.id === segId ? { ...s, ...patch } : s),
            }
        ),
    }));
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
    }));
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
    }));
}
