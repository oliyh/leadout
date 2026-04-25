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
    return block.segments.reduce((sum, s) => sum + s.duration, 0);
}

const PX_PER_SEC = 1.5;
const MIN_SEG_PX = 100;

function BlockRow({ prog, block, index, total }) {
    const act = activeSegment.value;
    const total_ = blockTotal(block);

    function onNameBlur(e) {
        const val = e.target.value.trim();
        if (val && val !== block.name) updateBlock(prog.id, block.id, { name: val });
    }

    function onAddSegment() {
        const seg = addSegment(prog.id, block.id, { name: 'Segment', duration: 60 });
        selectSegment(prog.id, block.id, seg.id);
    }

    const activeSeg = act?.blockId === block.id
        ? block.segments.find(s => s.id === act.segId)
        : null;

    return (
        <div class="timeline-row">
            <div class="timeline-row-header">
                <input
                    class="timeline-block-name"
                    defaultValue={block.name}
                    key={block.id + '-name'}
                    onBlur={onNameBlur}
                />
                <span class="block-total-dur">{fmtDuration(total_)}</span>
                <div class="timeline-row-actions">
                    <button class="btn-icon" disabled={index === 0}
                        onClick={() => moveBlock(prog.id, block.id, 'up')} title="Move up">↑</button>
                    <button class="btn-icon" disabled={index === total - 1}
                        onClick={() => moveBlock(prog.id, block.id, 'down')} title="Move down">↓</button>
                    <button class="btn-icon btn-danger"
                        onClick={() => deleteBlock(prog.id, block.id)} title="Delete block">✕</button>
                </div>
            </div>
            <div class="timeline-segments-row">
                <div class="timeline-segments">
                    {block.segments.map((seg, si) => {
                        const isActive = act?.blockId === block.id && act?.segId === seg.id;
                        const width = Math.max(MIN_SEG_PX, seg.duration * PX_PER_SEC);
                        return (
                            <div
                                key={seg.id}
                                class={`timeline-segment${isActive ? ' selected' : ''}`}
                                style={{ width: `${width}px` }}
                                onClick={() => selectSegment(prog.id, block.id, seg.id)}
                                title={`${seg.name} · ${fmtDuration(seg.duration)}`}
                            >
                                <span class="seg-label">{seg.name}</span>
                                <span class="seg-dur">{fmtDuration(seg.duration)}</span>
                                <span class="seg-arrows">
                                    {si > 0 && (
                                        <button class="seg-move" title="Move left"
                                            onClick={e => { e.stopPropagation(); moveSegment(prog.id, block.id, seg.id, 'left'); }}>
                                            ‹
                                        </button>
                                    )}
                                    {si < block.segments.length - 1 && (
                                        <button class="seg-move" title="Move right"
                                            onClick={e => { e.stopPropagation(); moveSegment(prog.id, block.id, seg.id, 'right'); }}>
                                            ›
                                        </button>
                                    )}
                                </span>
                            </div>
                        );
                    })}
                    <button class="timeline-add-seg" onClick={onAddSegment} title="Add segment">+</button>
                </div>
            </div>

            {activeSeg && (
                <SegmentPanel key={act.segId} progId={prog.id} blockId={block.id} seg={activeSeg} />
            )}
        </div>
    );
}

export function Timeline({ prog }) {
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
                <div class="timeline-empty">No blocks yet. Add one below.</div>
            )}

            {prog.blocks.map((block, i) => (
                <BlockRow key={block.id} prog={prog} block={block} index={i} total={prog.blocks.length} />
            ))}

            <div class="timeline-footer">
                <button class="btn-secondary" onClick={() => addBlock(prog.id, { name: 'Block' })}>
                    + Add block
                </button>
                <button class="btn-ghost" onClick={() => openTemplateModal(prog.id)}>
                    From template
                </button>
            </div>
        </div>
    );
}
