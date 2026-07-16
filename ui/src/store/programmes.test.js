import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

vi.mock('./api.js', () => ({ api: { put: vi.fn(), remove: vi.fn() } }));

import { programmes, addBlock, addSegment, cloneBlock, deleteBlock } from './programmes.js';

function makeProgramme(id) {
    return { id, name: 'Test programme', pace_assumption: null, blocks: [] };
}

beforeEach(() => {
    vi.useFakeTimers();
    programmes.value = [];
});

afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
});

describe('cloneBlock', () => {
    it('inserts a copy of the block immediately after the original', () => {
        programmes.value = [makeProgramme('p1')];
        const b1 = addBlock('p1', { name: 'Warm up' });
        const b2 = addBlock('p1', { name: 'Cool down' });

        cloneBlock('p1', b1.id);

        const prog = programmes.value.find(p => p.id === 'p1');
        expect(prog.blocks.map(b => b.name)).toEqual(['Warm up', 'Warm up', 'Cool down']);
        expect(prog.blocks[2].id).toBe(b2.id);
    });

    it('gives the clone a new id distinct from the source', () => {
        programmes.value = [makeProgramme('p1')];
        const block = addBlock('p1', { name: 'Intervals' });

        cloneBlock('p1', block.id);

        const prog = programmes.value.find(p => p.id === 'p1');
        const [original, clone] = prog.blocks;
        expect(clone.id).not.toBe(original.id);
    });

    it('deep-copies segments with fresh ids', () => {
        programmes.value = [makeProgramme('p1')];
        const block = addBlock('p1', { name: 'Intervals' });
        const seg = addSegment('p1', block.id, { name: 'Fast', kind: 'time', duration: 180 });

        cloneBlock('p1', block.id);

        const prog = programmes.value.find(p => p.id === 'p1');
        const [original, clone] = prog.blocks;
        expect(clone.segments).toHaveLength(1);
        expect(clone.segments[0].id).not.toBe(seg.id);
        expect(clone.segments[0].name).toBe('Fast');
        expect(clone.segments[0].duration).toBe(180);
        // mutating the clone's segment must not affect the original's
        expect(clone.segments[0]).not.toBe(original.segments[0]);
    });

    it('reassigns block positions to stay contiguous', () => {
        programmes.value = [makeProgramme('p1')];
        const b1 = addBlock('p1', { name: 'A' });
        addBlock('p1', { name: 'B' });
        addBlock('p1', { name: 'C' });

        cloneBlock('p1', b1.id);

        const prog = programmes.value.find(p => p.id === 'p1');
        expect(prog.blocks.map(b => b.position)).toEqual([0, 1, 2, 3]);
    });

    it('is a no-op when the block id does not exist', () => {
        programmes.value = [makeProgramme('p1')];
        addBlock('p1', { name: 'Only block' });

        cloneBlock('p1', 'does-not-exist');

        const prog = programmes.value.find(p => p.id === 'p1');
        expect(prog.blocks).toHaveLength(1);
    });

    it('clones the last block correctly', () => {
        programmes.value = [makeProgramme('p1')];
        addBlock('p1', { name: 'A' });
        const b2 = addBlock('p1', { name: 'B' });

        cloneBlock('p1', b2.id);

        const prog = programmes.value.find(p => p.id === 'p1');
        expect(prog.blocks.map(b => b.name)).toEqual(['A', 'B', 'B']);
    });

    it('does not affect other programmes', () => {
        programmes.value = [makeProgramme('p1'), makeProgramme('p2')];
        const b1 = addBlock('p1', { name: 'A' });
        addBlock('p2', { name: 'X' });

        cloneBlock('p1', b1.id);

        const p2 = programmes.value.find(p => p.id === 'p2');
        expect(p2.blocks).toHaveLength(1);
    });
});

describe('deleteBlock (sanity check for shared reindexing behaviour)', () => {
    it('reindexes remaining blocks after delete', () => {
        programmes.value = [makeProgramme('p1')];
        const b1 = addBlock('p1', { name: 'A' });
        addBlock('p1', { name: 'B' });

        deleteBlock('p1', b1.id);

        const prog = programmes.value.find(p => p.id === 'p1');
        expect(prog.blocks.map(b => b.position)).toEqual([0]);
    });
});
