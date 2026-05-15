import { useState, useRef } from 'preact/hooks';
import { updateSegment, deleteSegment } from '../store/programmes.js';
import { clearSelection } from '../store/editor.js';
import { parsePace, paceToDigits, fmtPaceDigits } from '../lib/pace.js';
import { LineSegmentMap } from './LineSegmentMap.jsx';

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
    const preFocusPaceDigits = useRef(null);
    const [exitType,    setExitType]    = useState(seg.exit_type || 'count');
    const [repeatCount, setRepeatCount] = useState(String(seg.repeat_count ?? 3));
    const [repeatMins,  setRepeatMins]  = useState(
        seg.kind === 'repeat' && seg.exit_type === 'time' && seg.duration
            ? String(Math.round(seg.duration / 60))
            : '10'
    );
    const [p1Lat, setP1Lat] = useState(String(seg.p1_lat ?? ''));
    const [p1Lng, setP1Lng] = useState(String(seg.p1_lng ?? ''));
    const [p2Lat, setP2Lat] = useState(String(seg.p2_lat ?? ''));
    const [p2Lng, setP2Lng] = useState(String(seg.p2_lng ?? ''));

    function save(overrides = {}, description = 'update segment') {
        const s = { kind, name, duration, distance, paceDigits, exitType, repeatCount, repeatMins, p1Lat, p1Lng, p2Lat, p2Lng, ...overrides };
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
        } else if (s.kind === 'line') {
            const paceFmt = fmtPaceDigits(s.paceDigits);
            updateSegment(progId, blockId, seg.id, {
                name:        s.name.trim(),
                kind:        'line',
                p1_lat:      s.p1Lat !== '' ? Number(s.p1Lat) : null,
                p1_lng:      s.p1Lng !== '' ? Number(s.p1Lng) : null,
                p2_lat:      s.p2Lat !== '' ? Number(s.p2Lat) : null,
                p2_lng:      s.p2Lng !== '' ? Number(s.p2Lng) : null,
                target_pace: paceFmt ? parsePace(paceFmt) : null,
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
        const newName = k === 'repeat' ? '' : k === 'line' ? 'Finish line' : name;
        setKind(k);
        setName(newName);
        setDuration('');
        setDistance('');
        setRepeatCount('3');
        setRepeatMins('10');
        setP1Lat(''); setP1Lng(''); setP2Lat(''); setP2Lng('');
        save({ kind: k, name: newName, duration: '', distance: '', repeatCount: '3', repeatMins: '10', p1Lat: '', p1Lng: '', p2Lat: '', p2Lng: '' }, 'change type');
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

    function onPaceFocus() {
        preFocusPaceDigits.current = paceDigits;
        setPaceDigits('');
    }

    function onPaceInput(e) {
        const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
        setPaceDigits(digits);
        debouncedSave({ paceDigits: digits }, 'update pace target');
    }

    function onPaceBlur() {
        if (paceDigits === '' && preFocusPaceDigits.current) {
            setPaceDigits(preFocusPaceDigits.current);
        }
        preFocusPaceDigits.current = null;
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

    function onMapChange(coords) {
        const next = { p1Lat, p1Lng, p2Lat, p2Lng, ...Object.fromEntries(
            Object.entries(coords).map(([k, v]) => [k, v != null ? String(v) : ''])
        )};
        if ('p1Lat' in coords) setP1Lat(next.p1Lat);
        if ('p1Lng' in coords) setP1Lng(next.p1Lng);
        if ('p2Lat' in coords) setP2Lat(next.p2Lat);
        if ('p2Lng' in coords) setP2Lng(next.p2Lng);
        save({ ...next }, 'update line');
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
                        <option value="line">Finish line</option>
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
                            inputMode="numeric"
                            value={fmtPaceDigits(paceDigits)}
                            onFocus={onPaceFocus}
                            onKeyDown={onPaceKeyDown}
                            onInput={onPaceInput}
                            onBlur={onPaceBlur}
                            onPaste={onPacePaste}
                        />
                    </div>
                )}
                {kind === 'line' && (
                    <>
                        <LineSegmentMap
                            p1Lat={p1Lat !== '' ? Number(p1Lat) : null}
                            p1Lng={p1Lng !== '' ? Number(p1Lng) : null}
                            p2Lat={p2Lat !== '' ? Number(p2Lat) : null}
                            p2Lng={p2Lng !== '' ? Number(p2Lng) : null}
                            onChange={onMapChange}
                        />
                        <div class="seg-field seg-field-coords">
                            <label>P1</label>
                            <input type="number" step="any" value={p1Lat} placeholder="lat" onInput={e => { setP1Lat(e.target.value); debouncedSave({ p1Lat: e.target.value }, 'update line'); }} />
                            <input type="number" step="any" value={p1Lng} placeholder="lng" onInput={e => { setP1Lng(e.target.value); debouncedSave({ p1Lng: e.target.value }, 'update line'); }} />
                        </div>
                        <div class="seg-field seg-field-coords">
                            <label>P2</label>
                            <input type="number" step="any" value={p2Lat} placeholder="lat" onInput={e => { setP2Lat(e.target.value); debouncedSave({ p2Lat: e.target.value }, 'update line'); }} />
                            <input type="number" step="any" value={p2Lng} placeholder="lng" onInput={e => { setP2Lng(e.target.value); debouncedSave({ p2Lng: e.target.value }, 'update line'); }} />
                        </div>
                    </>
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
