// ── State ─────────────────────────────────────────────────────────────────────

const state = {
    programmes: [],
    selectedId: null,
    modal: null,        // null | { mode: 'new'|'clone'|'template', tab: ... }
    editingSegment: null, // null | { blockId, segId }
};

// ── Utilities ─────────────────────────────────────────────────────────────────

function sel() { return state.programmes.find(p => p.id === state.selectedId) || null; }

function today() { return new Date().toISOString().slice(0, 10); }
function isToday(date) { return date === today(); }
function isPast(date) { return date < today(); }

function fmtDate(d) {
    if (!d) return '';
    const [y, m, day] = d.split('-');
    return new Date(y, m - 1, day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDuration(secs) {
    const m = Math.floor(secs / 60), s = secs % 60;
    return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

function fmtSegDuration(secs) {
    const m = Math.floor(secs / 60), s = secs % 60;
    return m === 0 ? `${s}s` : `${m}:${String(s).padStart(2, '0')}`;
}

function paceToStr(secsPerKm) {
    if (!secsPerKm) return '';
    return `${Math.floor(secsPerKm / 60)}:${String(secsPerKm % 60).padStart(2, '0')}`;
}

function strToPace(str) {
    if (!str || !str.includes(':')) return null;
    const [m, s] = str.split(':').map(Number);
    if (isNaN(m) || isNaN(s)) return null;
    return m * 60 + s;
}

function blockTotalSecs(block) {
    return block.segments.reduce((sum, s) => sum + (s.duration || 0), 0);
}

function programmeTotalSecs(prog) {
    return prog.blocks.reduce((sum, b) => sum + blockTotalSecs(b), 0);
}

function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === 'className') el.className = v;
        else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
        else el.setAttribute(k, v);
    }
    for (const child of children.flat()) {
        if (child == null) continue;
        el.append(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return el;
}

// ── API ───────────────────────────────────────────────────────────────────────

async function api(method, path, body) {
    const opts = { method, headers: {} };
    if (body !== undefined) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    }
    const res = await fetch(path, opts);
    if (res.status === 204) return null;
    return res.json();
}

async function reload() {
    state.programmes = await api('GET', '/api/programmes');
}

// ── Template generation ───────────────────────────────────────────────────────

function generatePyramidSegments(min, max, inc, fastName, recoveryName) {
    const steps = [];
    for (let d = min; d <= max; d += inc) steps.push(d);
    const allSteps = [...steps, ...[...steps].reverse().slice(1)];
    return allSteps.flatMap(duration => [
        { name: fastName, kind: 'time', duration },
        { name: recoveryName, kind: 'time', duration },
    ]);
}

function pyramidPreviewText(min, max, inc, fastName, recoveryName) {
    if (!min || !max || !inc || min > max) return '—';
    const segs = generatePyramidSegments(min, max, inc, fastName || 'Fast', recoveryName || 'Easy');
    return segs.map(s => `${s.name} ${fmtSegDuration(s.duration)}`).join('  ·  ');
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function renderSidebar() {
    const list = document.getElementById('programme-list');
    list.innerHTML = '';
    if (state.programmes.length === 0) {
        list.append(h('div', { className: 'prog-item' }, h('div', { className: 'prog-item-meta' }, 'No programmes yet')));
        return;
    }
    for (const prog of state.programmes) {
        const isActive = prog.id === state.selectedId;
        const meta = isPast(prog.scheduled_date) ? 'Expired · ' + fmtDate(prog.scheduled_date)
            : isToday(prog.scheduled_date) ? 'Today'
            : fmtDate(prog.scheduled_date);
        const item = h('div', { className: `prog-item${isActive ? ' active' : ''}`, onClick: () => select(prog.id) },
            h('div', { className: 'prog-item-name' }, prog.name),
            h('div', { className: `prog-item-meta${isToday(prog.scheduled_date) ? ' prog-item-today' : ''}` }, meta),
        );
        list.append(item);
    }
}

// ── Editor ────────────────────────────────────────────────────────────────────

function renderEditor() {
    const main = document.getElementById('main');
    const prog = sel();
    if (!prog) {
        main.innerHTML = '<div class="empty-state"><p>Select a programme or create a new one.</p></div>';
        return;
    }

    const totalSecs = programmeTotalSecs(prog);
    const showWarning = isToday(prog.scheduled_date);

    const nameInput = h('input', {
        className: 'input-prog-name', value: prog.name, placeholder: 'Programme name',
        onChange: async e => {
            prog.name = e.target.value;
            await api('PUT', `/api/programmes/${prog.id}`, { name: prog.name });
            renderSidebar();
        },
    });

    const dateInput = h('input', { type: 'date', value: prog.scheduled_date,
        onChange: async e => {
            prog.scheduled_date = e.target.value;
            await api('PUT', `/api/programmes/${prog.id}`, { scheduled_date: prog.scheduled_date });
            renderEditor();
            renderSidebar();
        },
    });

    const paceInput = h('input', { type: 'text', value: paceToStr(prog.pace_assumption),
        placeholder: '5:30', style: 'width:60px',
        onBlur: async e => {
            const p = strToPace(e.target.value);
            if (p) {
                prog.pace_assumption = p;
                await api('PUT', `/api/programmes/${prog.id}`, { pace_assumption: p });
            }
        },
    });

    const header = h('div', { className: 'editor-header' },
        h('div', { className: 'editor-header-fields' },
            nameInput,
            h('div', { className: 'editor-meta-row' },
                h('div', { className: 'meta-field' }, h('label', {}, 'Date'), dateInput),
                h('div', { className: 'meta-field' }, h('label', {}, 'Pace'), paceInput, '/km'),
                totalSecs > 0 ? h('div', { className: 'meta-field' }, '·  Total: ', fmtDuration(totalSecs)) : null,
            ),
        ),
        h('div', { className: 'editor-actions' },
            h('button', { className: 'btn-ghost', onClick: () => openModal({ mode: 'clone', sourceId: prog.id }) }, 'Clone'),
            h('button', { className: 'btn-ghost btn-danger', onClick: () => deleteProgram(prog.id) }, 'Delete'),
        ),
    );

    const parts = [header];

    if (showWarning) {
        parts.push(h('div', { className: 'warning-banner' },
            '⚠ This session is today — runners may not sync in time to pick up edits.'));
    }

    parts.push(renderTimeline(prog));
    parts.push(renderBlocks(prog));

    const editor = h('div', { className: 'editor' }, ...parts);
    main.innerHTML = '';
    main.append(editor);
}

// ── Timeline ──────────────────────────────────────────────────────────────────

function renderTimeline(prog) {
    if (prog.blocks.length === 0) return h('div', {});

    const rows = prog.blocks.map(block => {
        const totalSecs = blockTotalSecs(block);
        const segs = block.segments.map(seg =>
            h('div', {
                className: 'timeline-segment',
                style: `flex-grow: ${seg.duration}`,
                title: `${seg.name} · ${fmtSegDuration(seg.duration)}`,
            }, seg.name)
        );
        return h('div', { className: 'timeline-block' },
            h('div', { className: 'timeline-block-label' }, block.name),
            h('div', { className: 'timeline-segments' }, ...segs),
            h('div', { className: 'timeline-block-duration' }, fmtDuration(totalSecs)),
        );
    });

    const totalSecs = programmeTotalSecs(prog);

    return h('div', { className: 'timeline' },
        h('div', { className: 'timeline-title' }, 'Timeline'),
        ...rows,
        totalSecs > 0
            ? h('div', { className: 'timeline-total' }, `Total: ${fmtDuration(totalSecs)}`)
            : null,
    );
}

// ── Blocks ────────────────────────────────────────────────────────────────────

function renderBlocks(prog) {
    const cards = prog.blocks.map((block, bi) => renderBlockCard(prog, block, bi));

    const footer = h('div', { className: 'blocks-footer' },
        h('button', { className: 'btn-secondary', onClick: () => addBlankBlock(prog) }, '+ Blank block'),
        h('button', { className: 'btn-ghost', onClick: () => openModal({ mode: 'template', programmeId: prog.id }) }, '⊕ From template'),
    );

    return h('div', { className: 'blocks-section' }, ...cards, footer);
}

function renderBlockCard(prog, block, bi) {
    const nameInput = h('input', {
        className: 'input-block-name', value: block.name, placeholder: 'Block name',
        onChange: async e => {
            block.name = e.target.value;
            await api('PUT', `/api/programmes/${prog.id}/blocks/${block.id}`, { name: block.name });
            renderTimeline_update(prog);
        },
    });

    const moveUp = bi > 0
        ? h('button', { className: 'btn-icon', title: 'Move up', onClick: () => moveBlock(prog, block, bi - 1) }, '↑')
        : null;
    const moveDown = bi < prog.blocks.length - 1
        ? h('button', { className: 'btn-icon', title: 'Move down', onClick: () => moveBlock(prog, block, bi + 1) }, '↓')
        : null;

    const del = h('button', { className: 'btn-icon btn-danger', title: 'Delete block',
        onClick: () => deleteBlock(prog, block) }, '✕');

    const chips = block.segments.map((seg, si) => {
        const isEven = si % 2 === 0;
        const isEditing = state.editingSegment
            && state.editingSegment.blockId === block.id
            && state.editingSegment.segId === seg.id;
        const chip = h('div', {
            className: `segment-chip ${isEven ? 'effort' : 'recovery'}${isEditing ? ' selected' : ''}`,
            onClick: () => toggleSegmentEditor(block.id, seg.id),
        },
            si > 0 ? h('button', { className: 'segment-chip-move', title: 'Move left',
                onClick: e => { e.stopPropagation(); moveSegment(prog, block, seg, si - 1); } }, '←') : null,
            `${seg.name} ${fmtSegDuration(seg.duration)}`,
            si < block.segments.length - 1 ? h('button', { className: 'segment-chip-move', title: 'Move right',
                onClick: e => { e.stopPropagation(); moveSegment(prog, block, seg, si + 1); } }, '→') : null,
        );
        return chip;
    });

    const addSegBtn = h('button', { className: 'btn-ghost', onClick: () => addSegment(prog, block) }, '+ Segment');

    const bodyChildren = [
        h('div', { className: 'segment-chips' }, ...chips, addSegBtn),
    ];

    if (state.editingSegment && state.editingSegment.blockId === block.id) {
        const seg = block.segments.find(s => s.id === state.editingSegment.segId);
        if (seg) bodyChildren.push(renderSegmentEditor(prog, block, seg));
    }

    return h('div', { className: 'block-card' },
        h('div', { className: 'block-card-header' }, nameInput, moveUp, moveDown, del),
        h('div', { className: 'block-card-body' }, ...bodyChildren),
    );
}

function renderSegmentEditor(prog, block, seg) {
    const nameInput = h('input', { type: 'text', value: seg.name, placeholder: 'Name' });
    const durInput = h('input', { type: 'number', value: seg.duration, min: '1', placeholder: '60', style: 'width:80px' });
    const paceInput = h('input', { type: 'text', value: paceToStr(seg.target_pace), placeholder: 'e.g. 4:30', style: 'width:70px' });

    const save = h('button', { className: 'btn-primary', onClick: async () => {
        seg.name = nameInput.value;
        seg.duration = parseInt(durInput.value) || seg.duration;
        seg.target_pace = strToPace(paceInput.value);
        await api('PUT', `/api/programmes/${prog.id}/blocks/${block.id}/segments/${seg.id}`, {
            name: seg.name, duration: seg.duration, target_pace: seg.target_pace,
        });
        state.editingSegment = null;
        renderEditor();
    }}, 'Save');

    const cancel = h('button', { className: 'btn-ghost', onClick: () => {
        state.editingSegment = null;
        renderEditor();
    }}, 'Cancel');

    const del = h('button', { className: 'btn-ghost btn-danger', onClick: () => deleteSegment(prog, block, seg) }, 'Delete segment');

    return h('div', { className: 'segment-editor' },
        h('div', { className: 'seg-field' }, h('label', {}, 'Name'), nameInput),
        h('div', { className: 'seg-field' }, h('label', {}, 'Duration (s)'), durInput),
        h('div', { className: 'seg-field' }, h('label', {}, 'Target pace /km'), paceInput),
        h('div', { className: 'seg-actions' }, save, cancel, del),
    );
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function select(id) {
    state.selectedId = id;
    state.editingSegment = null;
    renderSidebar();
    renderEditor();
}

async function deleteProgram(id) {
    if (!confirm('Delete this programme?')) return;
    await api('DELETE', `/api/programmes/${id}`);
    state.selectedId = null;
    await reload();
    renderSidebar();
    renderEditor();
}

async function addBlankBlock(prog) {
    const block = await api('POST', `/api/programmes/${prog.id}/blocks`, { name: 'New block' });
    prog.blocks.push(block);
    renderEditor();
}

async function moveBlock(prog, block, newPos) {
    await api('PUT', `/api/programmes/${prog.id}/blocks/${block.id}`, { position: newPos });
    prog.blocks.splice(prog.blocks.indexOf(block), 1);
    prog.blocks.splice(newPos, 0, block);
    prog.blocks.forEach((b, i) => b.position = i);
    renderEditor();
}

async function deleteBlock(prog, block) {
    await api('DELETE', `/api/programmes/${prog.id}/blocks/${block.id}`);
    prog.blocks = prog.blocks.filter(b => b.id !== block.id);
    prog.blocks.forEach((b, i) => b.position = i);
    state.editingSegment = null;
    renderEditor();
}

async function addSegment(prog, block) {
    const seg = await api('POST', `/api/programmes/${prog.id}/blocks/${block.id}/segments`,
        { name: 'Segment', duration: 60 });
    block.segments.push(seg);
    state.editingSegment = { blockId: block.id, segId: seg.id };
    renderEditor();
}

async function moveSegment(prog, block, seg, newPos) {
    await api('PUT', `/api/programmes/${prog.id}/blocks/${block.id}/segments/${seg.id}`, { position: newPos });
    block.segments.splice(block.segments.indexOf(seg), 1);
    block.segments.splice(newPos, 0, seg);
    block.segments.forEach((s, i) => s.position = i);
    renderEditor();
}

async function deleteSegment(prog, block, seg) {
    await api('DELETE', `/api/programmes/${prog.id}/blocks/${block.id}/segments/${seg.id}`);
    block.segments = block.segments.filter(s => s.id !== seg.id);
    block.segments.forEach((s, i) => s.position = i);
    state.editingSegment = null;
    renderEditor();
}

function toggleSegmentEditor(blockId, segId) {
    if (state.editingSegment && state.editingSegment.blockId === blockId && state.editingSegment.segId === segId) {
        state.editingSegment = null;
    } else {
        state.editingSegment = { blockId, segId };
    }
    renderEditor();
}

function renderTimeline_update(prog) {
    // lightweight refresh — just re-render the whole editor for simplicity
    renderEditor();
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function openModal(opts) {
    state.modal = { tab: 'scratch', ...opts };
    renderModal();
    document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
    state.modal = null;
}

document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
});

function renderModal() {
    const modal = document.getElementById('modal');
    modal.innerHTML = '';
    const m = state.modal;
    if (!m) return;

    if (m.mode === 'clone') {
        renderCloneModal(modal, m);
    } else if (m.mode === 'template') {
        renderTemplateModal(modal, m);
    } else {
        renderNewModal(modal, m);
    }
}

function renderNewModal(modal, m) {
    const tabs = ['scratch', 'clone', 'template'].map(tab =>
        h('button', { className: `modal-tab${m.tab === tab ? ' active' : ''}`,
            onClick: () => { state.modal.tab = tab; renderModal(); } },
            tab === 'scratch' ? 'Blank' : tab === 'clone' ? 'Clone' : 'Template')
    );

    modal.append(h('h2', {}, 'New Programme'));
    modal.append(h('div', { className: 'modal-tabs' }, ...tabs));

    if (m.tab === 'scratch') renderScratchForm(modal);
    else if (m.tab === 'clone') renderCloneForm(modal, null);
    else if (m.tab === 'template') renderTemplateForm(modal, null);
}

function renderScratchForm(modal) {
    const nameInput = h('input', { type: 'text', placeholder: 'e.g. Tuesday Track', value: '' });
    const dateInput = h('input', { type: 'date', value: today() });

    modal.append(
        h('div', { className: 'form-field' }, h('label', {}, 'Name'), nameInput),
        h('div', { className: 'form-field' }, h('label', {}, 'Date'), dateInput),
        h('div', { className: 'modal-actions' },
            h('button', { className: 'btn-ghost', onClick: closeModal }, 'Cancel'),
            h('button', { className: 'btn-primary', onClick: async () => {
                const prog = await api('POST', '/api/programmes', {
                    name: nameInput.value || 'Untitled',
                    scheduled_date: dateInput.value,
                });
                state.programmes.unshift(prog);
                closeModal();
                await select(prog.id);
            }}, 'Create'),
        ),
    );
}

function renderCloneForm(modal, sourceId) {
    const options = state.programmes.map(p =>
        h('option', { value: p.id, ...(p.id === sourceId ? { selected: '' } : {}) },
            `${p.name} · ${fmtDate(p.scheduled_date)}`)
    );
    const selectEl = h('select', {}, ...options);
    const dateInput = h('input', { type: 'date', value: today() });

    modal.append(
        h('div', { className: 'form-field' }, h('label', {}, 'Source programme'), selectEl),
        h('div', { className: 'form-field' }, h('label', {}, 'New date'), dateInput),
        h('div', { className: 'modal-actions' },
            h('button', { className: 'btn-ghost', onClick: closeModal }, 'Cancel'),
            h('button', { className: 'btn-primary', onClick: async () => {
                const prog = await api('POST', `/api/programmes/${selectEl.value}/clone`, {
                    scheduled_date: dateInput.value,
                });
                state.programmes.unshift(prog);
                closeModal();
                await select(prog.id);
            }}, 'Clone'),
        ),
    );
}

function renderCloneModal(modal, m) {
    modal.append(h('h2', {}, 'Clone Programme'));
    renderCloneForm(modal, m.sourceId);
}

function renderTemplateForm(modal, programmeId) {
    const minInput = h('input', { type: 'number', value: '60', min: '1', placeholder: '60' });
    const maxInput = h('input', { type: 'number', value: '180', min: '1', placeholder: '180' });
    const incInput = h('input', { type: 'number', value: '60', min: '1', placeholder: '60' });
    const fastInput = h('input', { type: 'text', value: 'Fast', placeholder: 'Fast' });
    const easyInput = h('input', { type: 'text', value: 'Easy', placeholder: 'Easy' });

    const preview = h('div', { className: 'template-preview' });

    function updatePreview() {
        const segs = pyramidPreviewText(
            parseInt(minInput.value), parseInt(maxInput.value), parseInt(incInput.value),
            fastInput.value, easyInput.value,
        );
        preview.textContent = segs;
    }

    [minInput, maxInput, incInput, fastInput, easyInput].forEach(el =>
        el.addEventListener('input', updatePreview));
    updatePreview();

    const fields = [
        h('div', { className: 'form-row' },
            h('div', { className: 'form-field' }, h('label', {}, 'Min (s)'), minInput),
            h('div', { className: 'form-field' }, h('label', {}, 'Max (s)'), maxInput),
        ),
        h('div', { className: 'form-field' }, h('label', {}, 'Increment (s)'), incInput),
        h('div', { className: 'form-row' },
            h('div', { className: 'form-field' }, h('label', {}, 'Effort name'), fastInput),
            h('div', { className: 'form-field' }, h('label', {}, 'Recovery name'), easyInput),
        ),
        h('div', { className: 'form-field' }, h('label', {}, 'Preview'), preview),
    ];

    // If no programmeId, show name + date fields too
    let nameInput = null, dateInput = null;
    if (!programmeId) {
        nameInput = h('input', { type: 'text', placeholder: 'e.g. Tuesday Track' });
        dateInput = h('input', { type: 'date', value: today() });
        fields.unshift(
            h('div', { className: 'form-field' }, h('label', {}, 'Name'), nameInput),
            h('div', { className: 'form-field' }, h('label', {}, 'Date'), dateInput),
        );
    }

    modal.append(
        ...fields,
        h('div', { className: 'modal-actions' },
            h('button', { className: 'btn-ghost', onClick: closeModal }, 'Cancel'),
            h('button', { className: 'btn-primary', onClick: async () => {
                const min = parseInt(minInput?.value ?? minInput?.value ?? 60);
                const segs = generatePyramidSegments(
                    parseInt(minInput?.value ?? '60'),
                    parseInt(maxInput.value),
                    parseInt(incInput.value),
                    fastInput.value || 'Fast',
                    easyInput.value || 'Easy',
                );
                const blockName = `Pyramid ${fmtSegDuration(parseInt(minInput?.value ?? '60'))}–${fmtSegDuration(parseInt(maxInput.value))}`;

                let targetProgId = programmeId;
                if (!targetProgId) {
                    const prog = await api('POST', '/api/programmes', {
                        name: nameInput?.value || 'Untitled',
                        scheduled_date: dateInput?.value || today(),
                    });
                    state.programmes.unshift(prog);
                    targetProgId = prog.id;
                }

                const prog = state.programmes.find(p => p.id === targetProgId);
                const block = await api('POST', `/api/programmes/${targetProgId}/blocks`, {
                    name: blockName, segments: segs,
                });
                if (prog) prog.blocks.push(block);

                closeModal();
                await select(targetProgId);
            }}, 'Generate'),
        ),
    );
}

function renderTemplateModal(modal, m) {
    modal.append(h('h2', {}, 'Generate block from template'));
    modal.append(h('div', { className: 'form-field' }, h('label', {}, 'Template'),
        h('select', {}, h('option', { value: 'pyramid' }, 'Pyramid'))));
    renderTemplateForm(modal, m.programmeId);
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.getElementById('btn-new').addEventListener('click', () => openModal({ mode: 'new', tab: 'scratch' }));

async function init() {
    state.programmes = await api('GET', '/api/programmes');
    renderSidebar();
    renderEditor();
}

init();
