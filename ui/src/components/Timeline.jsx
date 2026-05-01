import { useRef } from 'preact/hooks';
import { activeSegment, selectSegment } from '../store/editor.js';
import { addBlock, updateBlock, deleteBlock, moveBlock, addSegment, moveSegment } from '../store/programmes.js';
import { SegmentPanel } from './SegmentPanel.jsx';
import { openTemplateModal } from '../store/modal.js';

function fmtDuration(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m === 0) return `${s}s`;
    return s === 0 ? `${m}m` : `${m}m${s}s`;
}

function blockTotal(block) {
    return block.segments.reduce((sum, s) => sum + (s.duration ?? 0), 0);
}

function segLabel(seg) {
    if (seg.kind === 'distance') return `${seg.distance ?? '?'}m`;
    return fmtDuration(seg.duration ?? 0);
}

function segEstimate(seg, pace) {
    if (!pace || pace <= 0) return null;
    if (seg.kind === 'distance' && seg.distance) {
        return `~${fmtDuration(Math.round(seg.distance / 1000 * pace))}`;
    }
    if (seg.kind !== 'distance' && seg.duration) {
        return `~${Math.round(seg.duration / pace * 1000)}m`;
    }
    return null;
}

function segWidth(seg) {
    if (seg.kind === 'distance') return Math.max(MIN_SEG_PX, (seg.distance ?? 0) * 0.25);
    return Math.max(MIN_SEG_PX, (seg.duration ?? 0) * PX_PER_SEC);
}

const PX_PER_SEC = 1.5;
const MIN_SEG_PX = 100;

function SegmentStrip({ prog, block, act, readonly }) {
    const dragSrc = useRef(null);
    const dragOver = useRef(null);

    function onAddSegment() {
        const seg = addSegment(prog.id, block.id, { name: 'Segment', duration: 60 });
        selectSegment(prog.id, block.id, seg.id);
    }

    function onDragStart(e, segId) {
        dragSrc.current = segId;
        e.dataTransfer.effectAllowed = 'move';
        e.currentTarget.style.opacity = '0.4';
    }

    function onDragEnd(e) {
        e.currentTarget.style.opacity = '';
        dragOver.current = null;
    }

    function onDragOver(e, segId) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        dragOver.current = segId;
    }

    function onDrop(e, targetSegId) {
        e.preventDefault();
        const srcId = dragSrc.current;
        if (srcId && srcId !== targetSegId) {
            const segs = block.segments;
            const srcIdx = segs.findIndex(s => s.id === srcId);
            const tgtIdx = segs.findIndex(s => s.id === targetSegId);
            const steps = Math.abs(tgtIdx - srcIdx);
            const dir = tgtIdx > srcIdx ? 'right' : 'left';
            for (let i = 0; i < steps; i++) {
                moveSegment(prog.id, block.id, srcId, dir);
            }
        }
        dragSrc.current = null;
    }

    return (
        <div class="timeline-segments-row">
            <div class="timeline-segments">
                {block.segments.map(seg => {
                    const isActive = !readonly && act?.blockId === block.id && act?.segId === seg.id;
                    const width = segWidth(seg);
                    return (
                        <div
                            key={seg.id}
                            class={`timeline-segment${isActive ? ' selected' : ''}${seg.kind === 'distance' ? ' seg-distance' : ''}${readonly ? ' seg-readonly' : ''}`}
                            style={{ width: `${width}px` }}
                            draggable={!readonly}
                            onClick={readonly ? undefined : () => selectSegment(prog.id, block.id, seg.id)}
                            onDragStart={readonly ? undefined : e => onDragStart(e, seg.id)}
                            onDragEnd={readonly ? undefined : onDragEnd}
                            onDragOver={readonly ? undefined : e => onDragOver(e, seg.id)}
                            onDrop={readonly ? undefined : e => onDrop(e, seg.id)}
                            title={readonly ? `${seg.name} · ${segLabel(seg)}` : `${seg.name} · ${segLabel(seg)} — drag to reorder`}
                        >
                            <span class="seg-label">{seg.name}</span>
                            <span class="seg-dur">{segLabel(seg)}</span>
                            {segEstimate(seg, prog.pace_assumption) && (
                                <span class="seg-est">{segEstimate(seg, prog.pace_assumption)}</span>
                            )}
                        </div>
                    );
                })}
                {!readonly && (
                    <button class="timeline-add-seg" onClick={onAddSegment} title="Add segment">+</button>
                )}
            </div>
        </div>
    );
}

function BlockRow({ prog, block, index, total, readonly }) {
    const act = activeSegment.value;
    const total_ = blockTotal(block);
    const activeSeg = !readonly && act?.blockId === block.id
        ? block.segments.find(s => s.id === act.segId)
        : null;

    function onNameBlur(e) {
        const val = e.target.value.trim();
        if (val && val !== block.name) updateBlock(prog.id, block.id, { name: val });
    }

    return (
        <div class="timeline-row">
            <div class="timeline-row-header">
                {readonly
                    ? <span class="timeline-block-name" style="padding:3px 6px">{block.name}</span>
                    : <input class="timeline-block-name" defaultValue={block.name} key={block.id + '-name'} onBlur={onNameBlur} />
                }
                <span class="block-total-dur">{fmtDuration(total_)}</span>
                {!readonly && (
                    <div class="timeline-row-actions">
                        <button class="btn-icon" disabled={index === 0}
                            onClick={() => moveBlock(prog.id, block.id, 'up')} title="Move up">↑</button>
                        <button class="btn-icon" disabled={index === total - 1}
                            onClick={() => moveBlock(prog.id, block.id, 'down')} title="Move down">↓</button>
                        <button class="btn-icon btn-danger"
                            onClick={() => deleteBlock(prog.id, block.id)} title="Delete block">✕</button>
                    </div>
                )}
            </div>
            <SegmentStrip prog={prog} block={block} act={act} readonly={readonly} />
            {activeSeg && (
                <SegmentPanel key={act.segId} progId={prog.id} blockId={block.id} seg={activeSeg} />
            )}
        </div>
    );
}

export function Timeline({ prog, readonly }) {
    const grand = prog.blocks.reduce((sum, b) => sum + blockTotal(b), 0);

    function fmtTotal(sec) {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return s === 0 ? `${m} min` : `${m}m ${s}s`;
    }

    return (
        <div class="timeline-section">
            <div class="timeline-header">
                <span class="section-title">Programme</span>
                {grand > 0 && <span class="timeline-total">{fmtTotal(grand)} total</span>}
            </div>

            {prog.blocks.length === 0 && (
                <div class="timeline-empty">{readonly ? 'No segments.' : 'No blocks yet. Add one below.'}</div>
            )}

            {prog.blocks.map((block, i) => (
                <BlockRow key={block.id} prog={prog} block={block} index={i} total={prog.blocks.length} readonly={readonly} />
            ))}

            {!readonly && (
                <div class="timeline-footer">
                    <button class="btn-secondary" onClick={() => addBlock(prog.id, { name: 'Block' })}>
                        + Add block
                    </button>
                    <button class="btn-ghost" onClick={() => openTemplateModal(prog.id)}>
                        From template
                    </button>
                </div>
            )}
        </div>
    );
}
