import { saving, lastSaved, updateProgramme, deleteProgramme } from '../store/programmes.js';
import { openConfirmDelete } from '../store/modal.js';
import { Timeline } from './Timeline.jsx';

// pace_assumption may be a plain number (330) or {seconds_per_km:330} from older API responses
function normPace(val) {
    if (val && typeof val === 'object') return val.seconds_per_km ?? 330;
    return Number(val) || 330;
}

function fmtPace(sec) {
    const n = normPace(sec);
    const m = Math.floor(n / 60);
    const s = String(n % 60).padStart(2, '0');
    return `${m}:${s}`;
}

function parsePace(str) {
    const parts = str.split(':');
    if (parts.length === 2) return Number(parts[0]) * 60 + Number(parts[1]);
    return Number(str);
}

function SaveIndicator() {
    if (saving.value) return <span class="save-indicator">Saving…</span>;
    if (lastSaved.value) return <span class="save-indicator saved">✓ Saved</span>;
    return null;
}

export function Editor({ prog }) {
    function onNameBlur(e) {
        const val = e.target.value.trim();
        if (val && val !== prog.name) updateProgramme(prog.id, { name: val });
    }

    function onDateBlur(e) {
        const val = e.target.value;
        if (val && val !== prog.scheduled_date) updateProgramme(prog.id, { scheduled_date: val });
    }

    function onPaceBlur(e) {
        const sec = parsePace(e.target.value);
        if (sec && sec !== prog.pace_assumption) updateProgramme(prog.id, { pace_assumption: sec });
        // reformat display
        e.target.value = fmtPace(prog.pace_assumption);
    }

    return (
        <div class="editor">
            <div class="editor-header">
                <div class="editor-header-fields">
                    <input
                        class="input-prog-name"
                        defaultValue={prog.name}
                        key={prog.id + '-name'}
                        onBlur={onNameBlur}
                    />
                    <div class="editor-meta-row">
                        <div class="meta-field">
                            <label>Date</label>
                            <input
                                type="date"
                                defaultValue={prog.scheduled_date}
                                key={prog.id + '-date'}
                                onBlur={onDateBlur}
                            />
                        </div>
                        <div class="meta-field">
                            <label>Pace assumption</label>
                            <input
                                style="width: 72px"
                                defaultValue={fmtPace(prog.pace_assumption)}
                                key={prog.id + '-pace'}
                                placeholder="5:30"
                                onBlur={onPaceBlur}
                            />
                        </div>
                        <SaveIndicator />
                    </div>
                </div>
                <div class="editor-actions">
                    <button class="btn-secondary" onClick={() => openConfirmDelete(prog.id)}>Delete</button>
                </div>
            </div>

            <Timeline prog={prog} />
        </div>
    );
}
