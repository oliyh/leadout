import { useState } from 'preact/hooks';
import { updateSegment, deleteSegment } from '../store/programmes.js';
import { clearSelection } from '../store/editor.js';
import { parsePace, paceToDigits, fmtPaceDigits } from '../lib/pace.js';

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
    const [paceDigits,  setPaceDigits]  = useState(() => paceToDigits(seg.target_pace));
    const [exitType,    setExitType]    = useState(seg.exit_type || 'count');
    const [repeatCount, setRepeatCount] = useState(String(seg.repeat_count ?? 3));
    const [repeatMins,  setRepeatMins]  = useState(
        seg.kind === 'repeat' && seg.exit_type === 'time' && seg.duration
            ? String(Math.round(seg.duration / 60))
            : '10'
    );

    function save(overrides = {}, description = 'update segment') {
        const s = { kind, name, duration, distance, paceDigits, exitType, repeatCount, repeatMins, ...overrides };
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
            const paceFmt = fmtPaceDigits(s.paceDigits);
            updateSegment(progId, blockId, seg.id, {
                name:        s.name.trim(),
                kind:        s.kind,
                duration:    s.kind === 'time'     ? (Number(s.duration) || null) : null,
                distance:    s.kind === 'distance' ? (Number(s.distance) || null) : null,
                target_pace: paceFmt ? parsePace(paceFmt) : null,
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

    function onPaceKeyDown(e) {
        if (e.key >= '0' && e.key <= '9') {
            e.preventDefault();
            if (paceDigits.length >= 4) return;
            const newDigits = paceDigits + e.key;
            setPaceDigits(newDigits);
            debouncedSave({ paceDigits: newDigits }, 'update pace target');
        } else if (e.key === 'Backspace' || e.key === 'Delete') {
            e.preventDefault();
            const newDigits = paceDigits.slice(0, -1);
            setPaceDigits(newDigits);
            debouncedSave({ paceDigits: newDigits }, 'update pace target');
        }
    }

    function onPacePaste(e) {
        e.preventDefault();
        const digits = (e.clipboardData?.getData('text') ?? '').replace(/\D/g, '').slice(0, 4);
        if (!digits) return;
        setPaceDigits(digits);
        debouncedSave({ paceDigits: digits }, 'update pace target');
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
                        <input
                            placeholder="5:30"
                            value={fmtPaceDigits(paceDigits)}
                            onKeyDown={onPaceKeyDown}
                            onPaste={onPacePaste}
                            readOnly
                        />
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
