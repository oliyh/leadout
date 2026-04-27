import { useState, useEffect, useRef } from 'preact/hooks';
import { instructorApi } from '../store/api.js';
import { createProgramme, loadChannels, showProgrammeEditor } from '../store/dashboard.js';
import { openExternalProgramme } from '../store/programmes.js';

function today() { return new Date().toISOString().slice(0, 10); }

function formatDate(iso) {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

function ChannelNameEditor({ channel, onRenamed }) {
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState(channel.name);
    const inputRef = useRef(null);

    function startEdit() { setName(channel.name); setEditing(true); }

    async function commit() {
        const trimmed = name.trim();
        if (trimmed && trimmed !== channel.name) {
            await instructorApi.updateChannel(channel.id, trimmed);
            onRenamed(trimmed);
        }
        setEditing(false);
    }

    function onKey(e) {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setEditing(false);
    }

    if (editing) {
        return (
            <div class="channel-name-editor">
                <input
                    ref={inputRef}
                    class="channel-name-input"
                    value={name}
                    onInput={e => setName(e.target.value)}
                    onBlur={commit}
                    onKeyDown={onKey}
                    autoFocus
                />
            </div>
        );
    }

    return (
        <div class="channel-name-editor">
            <h1 onClick={startEdit} title="Click to rename" class="channel-name-heading">{channel.name}</h1>
        </div>
    );
}

function NewProgrammeForm({ channelId, onDone }) {
    const [name, setName] = useState('');
    const [date, setDate] = useState(today());
    const [submitting, setSubmitting] = useState(false);

    async function submit(e) {
        e.preventDefault();
        if (!name.trim()) return;
        setSubmitting(true);
        try {
            await createProgramme(channelId, {
                name: name.trim(),
                scheduled_date: date,
                blocks: [],
            });
            onDone();
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <form class="new-prog-form" onSubmit={submit}>
            <input
                autoFocus
                value={name}
                onInput={e => setName(e.target.value)}
                placeholder="Programme name (e.g. Thursday intervals)"
            />
            <input
                type="date"
                value={date}
                onInput={e => setDate(e.target.value)}
            />
            <div class="form-actions">
                <button type="submit" class="btn-primary btn-sm" disabled={submitting}>
                    {submitting ? 'Creating…' : 'Create'}
                </button>
                <button type="button" class="btn-ghost btn-sm" onClick={onDone}>Cancel</button>
            </div>
        </form>
    );
}

function PropagationBadge({ programmeId }) {
    const [data, setData] = useState(null);
    useEffect(() => {
        instructorApi.getPropagation(programmeId).then(setData).catch(() => {});
    }, [programmeId]);
    if (!data) return null;
    const current = data.sync_records.filter(r => r.is_current).length;
    const total   = data.sync_records.length;
    return (
        <span class={`propagation-badge${current === total && total > 0 ? ' propagation-current' : ''}`}
              title={`${current}/${total} devices have the current version`}>
            {current}/{total} synced
        </span>
    );
}

export function ChannelPage({ channelId }) {
    const [channel, setChannel] = useState(null);
    const [programmes, setProgrammes] = useState([]);
    const [subscribers, setSubscribers] = useState([]);
    const [addingProg, setAddingProg] = useState(false);
    const [loading, setLoading] = useState(true);

    async function reload() {
        const [ch, progs, subs] = await Promise.all([
            instructorApi.getChannel(channelId),
            instructorApi.getChannelProgrammes(channelId),
            instructorApi.getSubscribers(channelId),
        ]);
        setChannel(ch);
        setProgrammes(progs);
        setSubscribers(subs);
        setLoading(false);
    }

    useEffect(() => { reload(); }, [channelId]);

    if (loading) return <div class="main-content"><p class="loading">Loading…</p></div>;
    if (!channel) return <div class="main-content"><p class="error">Channel not found.</p></div>;

    const t = today();
    const upcoming = programmes.filter(p => p.scheduled_date >= t);
    const past     = programmes.filter(p => p.scheduled_date < t);

    return (
        <div class="main-content channel-page">
            <ChannelNameEditor channel={channel} onRenamed={name => setChannel({ ...channel, name })} />
            <div class="channel-stats" style="margin-bottom:20px">
                <span>{subscribers.length} subscriber{subscribers.length !== 1 ? 's' : ''}</span>
            </div>

            <section class="channel-section">
                <div class="section-header">
                    <h2>Upcoming programmes</h2>
                    {!addingProg && (
                        <button class="btn-primary btn-sm" onClick={() => setAddingProg(true)}>
                            + New programme
                        </button>
                    )}
                </div>
                {addingProg && (
                    <NewProgrammeForm channelId={channelId} onDone={() => { setAddingProg(false); reload(); }} />
                )}
                {upcoming.length === 0 && !addingProg && (
                    <p class="empty-hint">No upcoming programmes. Create one to get started.</p>
                )}
                {upcoming.map(p => (
                    <div key={p.id} class="prog-row">
                        <div class="prog-row-info">
                            <span class="prog-row-name">{p.name}</span>
                            <span class={`prog-row-date${p.scheduled_date === t ? ' prog-item-today' : ''}`}>
                                {p.scheduled_date === t ? 'Today' : formatDate(p.scheduled_date)}
                            </span>
                        </div>
                        <div class="prog-row-meta">
                            <span class="participation-count" title="Participants who pressed start">
                                {p.participation_count} started
                            </span>
                            <PropagationBadge programmeId={p.id} />
                            <button class="btn-ghost btn-sm" onClick={() => {
                                openExternalProgramme(p);
                                showProgrammeEditor(p.id, channelId);
                            }}>Edit</button>
                        </div>
                    </div>
                ))}
            </section>

            {past.length > 0 && (
                <section class="channel-section channel-section-past">
                    <h2>Past programmes</h2>
                    {past.map(p => (
                        <div key={p.id} class="prog-row prog-row-past">
                            <div class="prog-row-info">
                                <span class="prog-row-name">{p.name}</span>
                                <span class="prog-row-date">{formatDate(p.scheduled_date)}</span>
                            </div>
                            <div class="prog-row-meta">
                                <span class="participation-count">{p.participation_count} started</span>
                                <PropagationBadge programmeId={p.id} />
                            </div>
                        </div>
                    ))}
                </section>
            )}

            {subscribers.length > 0 && (
                <section class="channel-section">
                    <h2>Subscribers</h2>
                    <p class="subscriber-list">{subscribers.length} device{subscribers.length !== 1 ? 's' : ''} subscribed</p>
                </section>
            )}
        </div>
    );
}
