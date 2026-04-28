import { useState } from 'preact/hooks';
import { modal, closeModal } from '../store/modal.js';
import { programmes, createProgramme, deleteProgramme, cloneProgramme, addBlock, openExternalProgramme } from '../store/programmes.js';
import { pyramidSegments, pyramidPreview } from '../store/templates.js';
import { unsubscribe, removeDevice, createProgramme as createChannelProgramme, showProgrammeEditor } from '../store/dashboard.js';

function today() { return new Date().toISOString().slice(0, 10); }

// ── New Programme ─────────────────────────────────────────────────────────────

function NewProgrammeModal() {
    const [tab, setTab] = useState('blank');
    const [name, setName] = useState('');
    const [date, setDate] = useState(today());
    const [cloneId, setCloneId] = useState(programmes.value[0]?.id ?? '');

    async function onCreate() {
        if (tab === 'blank') {
            await createProgramme({ name: name || 'Untitled', scheduled_date: date });
        } else {
            await cloneProgramme(cloneId, { scheduled_date: date });
        }
        closeModal();
    }

    return (
        <>
            <h2>New programme</h2>
            <div class="modal-tabs">
                {[['blank', 'Blank'], ['clone', 'Clone existing']].map(([t, label]) => (
                    <button key={t} class={`modal-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
                        {label}
                    </button>
                ))}
            </div>

            {tab === 'blank' && (
                <div class="form-field">
                    <label>Name</label>
                    <input value={name} onInput={e => setName(e.target.value)} placeholder="Tuesday Intervals" autoFocus />
                </div>
            )}

            {tab === 'clone' && (
                <div class="form-field">
                    <label>Clone from</label>
                    <select value={cloneId} onChange={e => setCloneId(e.target.value)}>
                        {programmes.value.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </div>
            )}

            <div class="form-field">
                <label>Date</label>
                <input type="date" value={date} onInput={e => setDate(e.target.value)} />
            </div>

            <div class="modal-actions">
                <button class="btn-ghost" onClick={closeModal}>Cancel</button>
                <button class="btn-primary" onClick={onCreate}>Create</button>
            </div>
        </>
    );
}

// ── Pyramid Template ──────────────────────────────────────────────────────────

function TemplateModal({ progId }) {
    const [minMin, setMinMin] = useState('1');
    const [maxMin, setMaxMin] = useState('5');
    const [incMin, setIncMin] = useState('1');
    const [effortName, setEffortName] = useState('Effort');
    const [recoveryName, setRecoveryName] = useState('Recovery');

    const params = {
        minSec: Number(minMin) * 60,
        maxSec: Number(maxMin) * 60,
        incSec: Number(incMin) * 60,
        effortName, recoveryName,
    };

    function onApply() {
        addBlock(progId, { name: 'Pyramid', segments: pyramidSegments(params) });
        closeModal();
    }

    return (
        <>
            <h2>Pyramid template</h2>
            <div class="form-row">
                <div class="form-field">
                    <label>Min (min)</label>
                    <input type="number" min="1" value={minMin} onInput={e => setMinMin(e.target.value)} />
                </div>
                <div class="form-field">
                    <label>Max (min)</label>
                    <input type="number" min="1" value={maxMin} onInput={e => setMaxMin(e.target.value)} />
                </div>
                <div class="form-field">
                    <label>Step (min)</label>
                    <input type="number" min="1" value={incMin} onInput={e => setIncMin(e.target.value)} />
                </div>
            </div>
            <div class="form-row">
                <div class="form-field">
                    <label>Effort label</label>
                    <input value={effortName} onInput={e => setEffortName(e.target.value)} />
                </div>
                <div class="form-field">
                    <label>Recovery label</label>
                    <input value={recoveryName} onInput={e => setRecoveryName(e.target.value)} />
                </div>
            </div>
            <div class="template-preview">{pyramidPreview(params)}</div>
            <div class="modal-actions">
                <button class="btn-ghost" onClick={closeModal}>Cancel</button>
                <button class="btn-primary" onClick={onApply}>Add block</button>
            </div>
        </>
    );
}

// ── Confirm Delete ────────────────────────────────────────────────────────────

function ConfirmDeleteModal({ progId }) {
    const prog = programmes.value.find(p => p.id === progId);

    async function onDelete() {
        await deleteProgramme(progId);
        closeModal();
    }

    return (
        <>
            <h2>Delete programme?</h2>
            <p style="color:#555; margin-bottom:20px">"{prog?.name}" will be permanently deleted.</p>
            <div class="modal-actions">
                <button class="btn-ghost" onClick={closeModal}>Cancel</button>
                <button class="btn-primary btn-danger" onClick={onDelete}>Delete</button>
            </div>
        </>
    );
}

// ── Confirm Unsubscribe ───────────────────────────────────────────────────────

function ConfirmUnsubscribeModal({ channelId, channelName }) {
    const [busy, setBusy] = useState(false);

    async function onConfirm() {
        setBusy(true);
        await unsubscribe(channelId);
        closeModal();
    }

    return (
        <>
            <h2>Unsubscribe?</h2>
            <p style="color:#555; margin-bottom:20px">
                You will stop receiving programmes from <strong>{channelName}</strong> on your watch.
            </p>
            <div class="modal-actions">
                <button class="btn-ghost" onClick={closeModal} disabled={busy}>Cancel</button>
                <button class="btn-primary btn-danger" onClick={onConfirm} disabled={busy}>
                    {busy ? 'Removing…' : 'Unsubscribe'}
                </button>
            </div>
        </>
    );
}

// ── Confirm Remove Device ─────────────────────────────────────────────────────

function ConfirmRemoveDeviceModal({ deviceId, deviceCode }) {
    const [busy, setBusy] = useState(false);

    async function onConfirm() {
        setBusy(true);
        await removeDevice(deviceId);
        closeModal();
    }

    return (
        <>
            <h2>Remove device?</h2>
            <p style="color:#555; margin-bottom:20px">
                Device <strong style="font-family:monospace">{deviceCode}</strong> will be unlinked from your account.
                Your watch will need to be re-registered before it can sync programmes again.
            </p>
            <div class="modal-actions">
                <button class="btn-ghost" onClick={closeModal} disabled={busy}>Cancel</button>
                <button class="btn-primary btn-danger" onClick={onConfirm} disabled={busy}>
                    {busy ? 'Removing…' : 'Remove device'}
                </button>
            </div>
        </>
    );
}

// ── Clone Programme ───────────────────────────────────────────────────────────

function CloneProgrammeModal({ prog, channelId }) {
    const [name, setName] = useState(prog.name);
    const [date, setDate] = useState(today());
    const [busy, setBusy] = useState(false);

    async function onSave() {
        setBusy(true);
        const newProg = await createChannelProgramme(channelId, {
            name: name.trim() || prog.name,
            scheduled_date: date,
            pace_assumption: prog.pace_assumption,
            blocks: prog.blocks,
        });
        openExternalProgramme(newProg);
        showProgrammeEditor(newProg.id, channelId);
        closeModal();
    }

    return (
        <>
            <h2>Clone programme</h2>
            <div class="form-field">
                <label>Name</label>
                <input autoFocus value={name} onInput={e => setName(e.target.value)} placeholder={prog.name} />
            </div>
            <div class="form-field">
                <label>Date</label>
                <input type="date" value={date} onInput={e => setDate(e.target.value)} />
            </div>
            <div class="modal-actions">
                <button class="btn-ghost" onClick={closeModal} disabled={busy}>Cancel</button>
                <button class="btn-primary" onClick={onSave} disabled={busy || !name.trim()}>
                    {busy ? 'Cloning…' : 'Clone'}
                </button>
            </div>
        </>
    );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export function Modal() {
    const m = modal.value;
    if (!m) return null;

    return (
        <div class="modal-overlay" onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
            <div class="modal">
                {m.type === 'new-programme'         && <NewProgrammeModal />}
                {m.type === 'template'              && <TemplateModal progId={m.progId} />}
                {m.type === 'confirm-delete'        && <ConfirmDeleteModal progId={m.progId} />}
                {m.type === 'confirm-unsubscribe'   && <ConfirmUnsubscribeModal channelId={m.channelId} channelName={m.channelName} />}
                {m.type === 'confirm-remove-device' && <ConfirmRemoveDeviceModal deviceId={m.deviceId} deviceCode={m.deviceCode} />}
                {m.type === 'clone-programme'       && <CloneProgrammeModal prog={m.prog} channelId={m.channelId} />}
            </div>
        </div>
    );
}
