import { useState, useEffect, useRef } from 'preact/hooks';
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
    const timer = useRef(null);
    return (...args) => {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => fn(...args), delay);
    };
}

export function SegmentPanel({ progId, blockId, seg }) {
    const [name, setName]         = useState(seg.name);
    const [kind, setKind]         = useState(seg.kind || 'time');
    const [duration, setDuration] = useState(String(seg.duration ?? 60));
    const [distance, setDistance] = useState(String(seg.distance ?? ''));
    const [pace, setPace]         = useState(seg.target_pace ? fmtPace(seg.target_pace) : '');

    function save(overrides = {}) {
        const state = { name, kind, duration, distance, pace, ...overrides };
        updateSegment(progId, blockId, seg.id, {
            name:        state.name.trim() || seg.name,
            kind:        state.kind,
            duration:    state.kind === 'time' ? (Number(state.duration) || seg.duration) : null,
            distance:    state.kind === 'distance' ? (Number(state.distance) || null) : null,
            target_pace: state.pace ? parsePace(state.pace) : null,
        });
    }

    const debouncedSave = useDebounce(save, 600);

    function onName(e) { setName(e.target.value); debouncedSave({ name: e.target.value }); }
    function onKind(e) { setKind(e.target.value); save({ kind: e.target.value }); }
    function onDuration(e) { setDuration(e.target.value); debouncedSave({ duration: e.target.value }); }
    function onDistance(e) { setDistance(e.target.value); debouncedSave({ distance: e.target.value }); }
    function onPace(e) { setPace(e.target.value); debouncedSave({ pace: e.target.value }); }

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
                <div class="seg-field">
                    <label>Target pace (m:ss/km)</label>
                    <input placeholder="5:30" value={pace} onInput={onPace} />
                </div>
            </div>
            <div class="segment-panel-actions">
                <button class="btn-ghost btn-danger" onClick={onDelete}>Delete</button>
                <button class="btn-ghost" onClick={clearSelection}>Close</button>
            </div>
        </div>
    );
}
