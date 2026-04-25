import { programmes, selectedId, pendingSync } from '../store/programmes.js';
import { openNewProgramme } from '../store/modal.js';

function today() { return new Date().toISOString().slice(0, 10); }

function formatDate(iso) {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function Sidebar() {
    const t = today();
    const pending = pendingSync.value;
    return (
        <aside class="sidebar">
            <div class="sidebar-header">
                <span class="logo">Leadout</span>
                <button class="btn-primary" onClick={openNewProgramme}>+ New</button>
            </div>
            <div id="programme-list">
                {programmes.value.map(p => (
                    <div
                        key={p.id}
                        class={`prog-item${selectedId.value === p.id ? ' active' : ''}`}
                        onClick={() => selectedId.value = p.id}
                    >
                        <div class="prog-item-name">
                            {p.name}
                            {pending.has(p.id) && <span class="sync-dot" title="Changes not yet synced to server" />}
                        </div>
                        <div class={`prog-item-meta${p.scheduled_date === t ? ' prog-item-today' : ''}`}>
                            {p.scheduled_date === t ? 'Today' : formatDate(p.scheduled_date)}
                        </div>
                    </div>
                ))}
            </div>
        </aside>
    );
}
