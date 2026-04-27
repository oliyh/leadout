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

export function SegmentPanel({ progId, blockId, seg }) {
    const [name, setName]         = useState(seg.name);
    const [kind, setKind]         = useState(seg.kind || 'time');
    const [duration, setDuration] = useState(String(seg.duration ?? 60));
    const [distance, setDistance] = useState(String(seg.distance ?? ''));
    const [pace, setPace]         = useState(seg.target_pace ? fmtPace(seg.target_pace) : '');

    function onSave() {
        updateSegment(progId, blockId, seg.id, {
            name:        name.trim() || seg.name,
            kind,
            duration:    kind === 'time' ? (Number(duration) || seg.duration) : null,
            distance:    kind === 'distance' ? (Number(distance) || null) : null,
            target_pace: pace ? parsePace(pace) : null,
        });
        clearSelection();
    }

    function onDelete() {
        deleteSegment(progId, blockId, seg.id);
        clearSelection();
    }

    return (
        <div class="segment-panel">
            <div class="segment-panel-fields">
                <div class="seg-field">
                    <label>Name</label>
                    <input value={name} onInput={e => setName(e.target.value)} />
                </div>
                <div class="seg-field">
                    <label>Type</label>
                    <select value={kind} onChange={e => setKind(e.target.value)} style="width:100px">
                        <option value="time">Time</option>
                        <option value="distance">Distance</option>
                    </select>
                </div>
                {kind === 'time' && (
                    <div class="seg-field">
                        <label>Duration (s)</label>
                        <input type="number" min="1" value={duration}
                            onInput={e => setDuration(e.target.value)} />
                    </div>
                )}
                {kind === 'distance' && (
                    <div class="seg-field">
                        <label>Distance (m)</label>
                        <input type="number" min="1" value={distance} placeholder="400"
                            onInput={e => setDistance(e.target.value)} />
                    </div>
                )}
                <div class="seg-field">
                    <label>Target pace (m:ss/km)</label>
                    <input placeholder="5:30" value={pace} onInput={e => setPace(e.target.value)} />
                </div>
            </div>
            <div class="segment-panel-actions">
                <button class="btn-ghost btn-danger" onClick={onDelete}>Delete</button>
                <button class="btn-ghost" onClick={clearSelection}>Cancel</button>
                <button class="btn-primary" onClick={onSave}>Save</button>
            </div>
        </div>
    );
}
