import { useEffect } from 'preact/hooks';
import { saving, lastSaved, updateProgramme, deleteProgramme, undoLabel, redoLabel, undo, redo } from '../store/programmes.js';
import { openConfirmDelete } from '../store/modal.js';
import { Timeline } from './Timeline.jsx';
import { fmtPace, parsePace } from '../lib/format.js';
import { normPace } from '../lib/estimates.js';

function SaveIndicator() {
    if (saving.value) return <span class="save-indicator">Saving…</span>;
    if (lastSaved.value) return <span class="save-indicator saved">✓ Saved</span>;
    return null;
}

export function Editor({ prog }) {
    useEffect(() => {
        function onKeyDown(e) {
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
            const key = e.key.toLowerCase();
            if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) {
                e.preventDefault();
                undo(prog.id);
            } else if ((e.ctrlKey || e.metaKey) && (key === 'y' || (key === 'z' && e.shiftKey))) {
                e.preventDefault();
                redo(prog.id);
            }
        }
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [prog.id]);

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
                    <button
                        class="btn-ghost"
                        disabled={!undoLabel.value}
                        onClick={() => undo(prog.id)}
                        title="Ctrl+Z"
                    >
                        ↩ {undoLabel.value ?? 'Undo'}
                    </button>
                    <button
                        class="btn-ghost"
                        disabled={!redoLabel.value}
                        onClick={() => redo(prog.id)}
                        title="Ctrl+Shift+Z"
                    >
                        ↪ {redoLabel.value ?? 'Redo'}
                    </button>
                    <button class="btn-secondary" onClick={() => openConfirmDelete(prog.id)}>Delete</button>
                </div>
            </div>

            <Timeline prog={prog} />
        </div>
    );
}
