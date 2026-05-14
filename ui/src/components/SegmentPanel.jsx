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

export function SegmentPanel({ progId, blockId, seg }) {
    const [kind,        setKind]        = useState(seg.kind || 'time');
    const [name,        setName]        = useState(seg.name || '');
    const [duration,    setDuration]    = useState(String(seg.duration ?? 60));
    const [distance,    setDistance]    = useState(String(seg.distance ?? ''));
    const [pace,        setPace]        = useState(seg.target_pace ? fmtPace(seg.target_pace) : '');
    const [exitType,    setExitType]    = useState(seg.exit_type || 'count');
    const [repeatCount, setRepeatCount] = useState(String(seg.repeat_count ?? 3));
    const [repeatMins,  setRepeatMins]  = useState(
        seg.kind === 'repeat' && seg.exit_type === 'time' && seg.duration
            ? String(Math.round(seg.duration / 60))
            : '10'
    );

    function save(overrides = {}, description = 'update segment') {
        const s = { kind, name, duration, distance, pace, exitType, repeatCount, repeatMins, ...overrides };
        if (s.kind === 'repeat') {
            updateSegment(progId, blockId, seg.id, {
                kind:         'repeat',
                name:         'Repeat',
                exit_type:    s.exitType,
                repeat_count: s.exitType === 'count'    ? (Number(s.repeatCount) || 3)       : null,
                duration:     s.exitType === 'time'     ? (Number(s.repeatMins) * 60 || 600) : null,
                distance:     s.exitType === 'distance' ? (Number(s.distance) || null)       : null,
                target_pace:  null,
            }, description);
        } else {
            updateSegment(progId, blockId, seg.id, {
                name:        s.name.trim(),
                kind:        s.kind,
                duration:    s.kind === 'time'     ? (Number(s.duration) || null) : null,
                distance:    s.kind === 'distance' ? (Number(s.distance) || null) : null,
                target_pace: s.pace ? parsePace(s.pace) : null,
            }, description);
        }
    }

    const debouncedSave = useDebounce(save, 600);

    function onKind(e) {
        const k = e.target.value;
        const newName = k === 'repeat' ? '' : name;
        setKind(k);
        setName(newName);
        setDuration('');
        setDistance('');
        setRepeatCount('3');
        setRepeatMins('10');
        save({ kind: k, name: newName, duration: '', distance: '', repeatCount: '3', repeatMins: '10' }, 'change type');
    }

    function onExitType(e) {
        const et = e.target.value;
        setExitType(et);
        save({ exitType: et });
    }

    function onDelete() {
        deleteSegment(progId, blockId, seg.id);
        clearSelection();
    }

    return (
        <div class="segment-panel">
            <div class="segment-panel-fields">
                <div class="seg-field">
                    <label>Type</label>
                    <select value={kind} onChange={onKind} style="width:100px">
                        <option value="time">Time</option>
                        <option value="distance">Distance</option>
                        <option value="repeat">Repeat</option>
                    </select>
                </div>

                {kind !== 'repeat' && (
                    <div class="seg-field">
                        <label>Name</label>
                        <input value={name} onInput={e => { setName(e.target.value); debouncedSave({ name: e.target.value }, 'rename segment'); }} />
                    </div>
                )}
                {kind === 'time' && (
                    <div class="seg-field">
                        <label>Duration (s)</label>
                        <input type="number" min="1" value={duration} onInput={e => { setDuration(e.target.value); debouncedSave({ duration: e.target.value }, 'update duration'); }} />
                    </div>
                )}
                {kind === 'distance' && (
                    <div class="seg-field">
                        <label>Distance (m)</label>
                        <input type="number" min="1" value={distance} placeholder="400" onInput={e => { setDistance(e.target.value); debouncedSave({ distance: e.target.value }, 'update distance'); }} />
                    </div>
                )}
                {kind !== 'repeat' && (
                    <div class="seg-field">
                        <label>Target pace (m:ss/km)</label>
                        <input placeholder="5:30" value={pace} onInput={e => { setPace(e.target.value); debouncedSave({ pace: e.target.value }, 'update pace target'); }} />
                    </div>
                )}

                {kind === 'repeat' && (
                    <>
                        <div class="seg-field">
                            <label>Until</label>
                            <select value={exitType} onChange={onExitType} style="width:120px">
                                <option value="count">Repetitions</option>
                                <option value="time">Time</option>
                                <option value="distance">Distance</option>
                            </select>
                        </div>
                        {exitType === 'count' && (
                            <div class="seg-field">
                                <label>Repetitions</label>
                                <input
                                    type="number" min="1" max="99"
                                    value={repeatCount}
                                    onInput={e => { setRepeatCount(e.target.value); debouncedSave({ repeatCount: e.target.value }); }}
                                />
                            </div>
                        )}
                        {exitType === 'time' && (
                            <div class="seg-field">
                                <label>Minutes</label>
                                <input
                                    type="number" min="1"
                                    value={repeatMins}
                                    onInput={e => { setRepeatMins(e.target.value); debouncedSave({ repeatMins: e.target.value }); }}
                                />
                            </div>
                        )}
                        {exitType === 'distance' && (
                            <div class="seg-field">
                                <label>Meters</label>
                                <input
                                    type="number" min="1"
                                    value={distance}
                                    placeholder="2000"
                                    onInput={e => { setDistance(e.target.value); debouncedSave({ distance: e.target.value }); }}
                                />
                            </div>
                        )}
                    </>
                )}
            </div>
            <div class="segment-panel-actions">
                <button class="btn-ghost btn-danger" onClick={onDelete}>Delete</button>
                <button class="btn-ghost" onClick={clearSelection}>Close</button>
            </div>
        </div>
    );
}
