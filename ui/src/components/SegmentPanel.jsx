import { useState } from 'preact/hooks';
import { updateSegment, deleteSegment } from '../store/programmes.js';
import { clearSelection } from '../store/editor.js';

function fmtPace(sec) {
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function parsePace(str) {
    const parts = str.split(':');
    if (parts.length === 2) return Number(parts[0]) * 60 + Number(parts[1]);
    return Number(str) || null;
}

function useDebounce(fn, delay) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

function RepeatPanel({ progId, blockId, seg }) {
    const [exitType,    setExitType]    = useState(seg.exit_type || 'count');
    const [repeatCount, setRepeatCount] = useState(String(seg.repeat_count ?? 3));
    const [duration,    setDuration]    = useState(String(seg.duration ?? 600));
    const [distance,    setDistance]    = useState(String(seg.distance ?? ''));

    function save(overrides = {}) {
        const s = { exitType, repeatCount, duration, distance, ...overrides };
        updateSegment(progId, blockId, seg.id, {
            kind:         'repeat',
            name:         'Repeat',
            exit_type:    s.exitType,
            repeat_count: s.exitType === 'count'    ? (Number(s.repeatCount) || 3)   : null,
            duration:     s.exitType === 'time'     ? (Number(s.duration)    || 600) : null,
            distance:     s.exitType === 'distance' ? (Number(s.distance)    || null): null,
            target_pace:  null,
        }, 'update repeat');
    }

    function onExitType(e) {
        setExitType(e.target.value);
        save({ exitType: e.target.value });
    }

    const debouncedSave = useDebounce(save, 600);

    function onDelete() {
        deleteSegment(progId, blockId, seg.id);
        clearSelection();
    }

    return (
        <div class="segment-panel">
            <div class="segment-panel-fields">
                <div class="seg-field">
                    <label>Exit condition</label>
                    <select value={exitType} onChange={onExitType} style="width:120px">
                        <option value="count">Count (×N)</option>
                        <option value="time">Time</option>
                        <option value="distance">Distance</option>
                    </select>
                </div>
                {exitType === 'count' && (
                    <div class="seg-field">
                        <label>Repeat count</label>
                        <input
                            type="number" min="1" max="99"
                            value={repeatCount}
                            onInput={e => { setRepeatCount(e.target.value); debouncedSave({ repeatCount: e.target.value }); }}
                        />
                    </div>
                )}
                {exitType === 'time' && (
                    <div class="seg-field">
                        <label>Duration (s)</label>
                        <input
                            type="number" min="1"
                            value={duration}
                            onInput={e => { setDuration(e.target.value); debouncedSave({ duration: e.target.value }); }}
                        />
                    </div>
                )}
                {exitType === 'distance' && (
                    <div class="seg-field">
                        <label>Distance (m)</label>
                        <input
                            type="number" min="1"
                            value={distance}
                            placeholder="2000"
                            onInput={e => { setDistance(e.target.value); debouncedSave({ distance: e.target.value }); }}
                        />
                    </div>
                )}
            </div>
            <div class="segment-panel-actions">
                <button class="btn-ghost btn-danger" onClick={onDelete}>Delete</button>
                <button class="btn-ghost" onClick={clearSelection}>Close</button>
            </div>
        </div>
    );
}

export function SegmentPanel({ progId, blockId, seg }) {
    if (seg.kind === 'repeat') {
        return <RepeatPanel progId={progId} blockId={blockId} seg={seg} />;
    }

    const [name, setName]         = useState(seg.name);
    const [kind, setKind]         = useState(seg.kind || 'time');
    const [duration, setDuration] = useState(String(seg.duration ?? 60));
    const [distance, setDistance] = useState(String(seg.distance ?? ''));
    const [pace, setPace]         = useState(seg.target_pace ? fmtPace(seg.target_pace) : '');

    function save(overrides = {}, description = 'update segment') {
        const state = { name, kind, duration, distance, pace, ...overrides };
        updateSegment(progId, blockId, seg.id, {
            name:        state.name.trim() || seg.name,
            kind:        state.kind,
            duration:    state.kind === 'time' ? (Number(state.duration) || seg.duration) : null,
            distance:    state.kind === 'distance' ? (Number(state.distance) || null) : null,
            target_pace: state.pace ? parsePace(state.pace) : null,
        }, description);
    }

    const debouncedSave = useDebounce(save, 600);

    function onName(e) { setName(e.target.value); debouncedSave({ name: e.target.value }, 'rename segment'); }
    function onKind(e) {
        const k = e.target.value;
        setKind(k);
        if (k === 'repeat') {
            updateSegment(progId, blockId, seg.id, {
                name: 'Repeat', kind: 'repeat', exit_type: 'count',
                repeat_count: 3, duration: null, distance: null, target_pace: null,
            }, 'change type');
        } else {
            save({ kind: k }, 'change type');
        }
    }
    function onDuration(e) { setDuration(e.target.value); debouncedSave({ duration: e.target.value }, 'update duration'); }
    function onDistance(e) { setDistance(e.target.value); debouncedSave({ distance: e.target.value }, 'update distance'); }
    function onPace(e) { setPace(e.target.value); debouncedSave({ pace: e.target.value }, 'update pace target'); }

    function onDelete() {
        deleteSegment(progId, blockId, seg.id);
        clearSelection();
    }

    return (
        <div class="segment-panel">
            <div class="segment-panel-fields">
                <div class="seg-field">
                    <label>Name</label>
                    <input value={name} onInput={onName} />
                </div>
                <div class="seg-field">
                    <label>Type</label>
                    <select value={kind} onChange={onKind} style="width:100px">
                        <option value="time">Time</option>
                        <option value="distance">Distance</option>
                        <option value="repeat">Repeat</option>
                    </select>
                </div>
                {kind === 'time' && (
                    <div class="seg-field">
                        <label>Duration (s)</label>
                        <input type="number" min="1" value={duration} onInput={onDuration} />
                    </div>
                )}
                {kind === 'distance' && (
                    <div class="seg-field">
                        <label>Distance (m)</label>
                        <input type="number" min="1" value={distance} placeholder="400" onInput={onDistance} />
                    </div>
                )}
                {kind !== 'repeat' && (
                    <div class="seg-field">
                        <label>Target pace (m:ss/km)</label>
                        <input placeholder="5:30" value={pace} onInput={onPace} />
                    </div>
                )}
            </div>
            <div class="segment-panel-actions">
                <button class="btn-ghost btn-danger" onClick={onDelete}>Delete</button>
                <button class="btn-ghost" onClick={clearSelection}>Close</button>
            </div>
        </div>
    );
}
