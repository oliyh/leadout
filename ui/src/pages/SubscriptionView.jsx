import { useState } from 'preact/hooks';
import { unsubscribe, showHome, showSubscription, showSubscriptionProgramme } from '../store/dashboard.js';
import { Timeline } from '../components/Timeline.jsx';

function today() { return new Date().toISOString().slice(0, 10); }

function formatDate(iso) {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

function ProgrammeReadonlyView({ prog, channelId, onBack }) {
    return (
        <div class="main-content editor-view">
            <button class="btn-ghost back-btn" onClick={onBack}>← Back to {prog.channel_name ?? 'channel'}</button>
            <div class="editor">
                <div class="editor-header">
                    <div class="editor-header-fields">
                        <div class="input-prog-name" style="border-bottom:none; cursor:default">{prog.name}</div>
                        <div class="editor-meta-row">
                            <div class="meta-field">
                                <label>Date</label>
                                <span style="font-size:13px; color:#555">{formatDate(prog.scheduled_date)}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <Timeline prog={prog} readonly />
            </div>
        </div>
    );
}

export function SubscriptionView({ channelId, programmeId, subscriptions }) {
    const [confirming, setConfirming] = useState(false);
    const [removing, setRemoving] = useState(false);

    const sub = subscriptions.value.find(s => s.channel_id === channelId);
    if (!sub) return <div class="main-content"><p>Subscription not found.</p></div>;

    if (programmeId) {
        const prog = (sub.programmes ?? []).find(p => p.id === programmeId);
        if (prog) {
            return <ProgrammeReadonlyView
                prog={{ ...prog, channel_name: sub.channel?.name }}
                channelId={channelId}
                onBack={() => showSubscription(channelId)}
            />;
        }
    }

    const t = today();
    const upcoming = (sub.programmes ?? []).filter(p => p.scheduled_date >= t);
    const past     = (sub.programmes ?? []).filter(p => p.scheduled_date < t);

    async function doUnsubscribe() {
        setRemoving(true);
        await unsubscribe(channelId);
        showHome();
    }

    return (
        <div class="main-content subscription-view">
            <div class="channel-page-header">
                <h1>{sub.channel?.name ?? 'Channel'}</h1>
                {!confirming
                    ? <button class="btn-danger btn-sm" onClick={() => setConfirming(true)}>Unsubscribe</button>
                    : (
                        <div class="confirm-unsubscribe">
                            <span>Remove this subscription?</span>
                            <button class="btn-danger btn-sm" onClick={doUnsubscribe} disabled={removing}>
                                {removing ? 'Removing…' : 'Yes, unsubscribe'}
                            </button>
                            <button class="btn-ghost btn-sm" onClick={() => setConfirming(false)}>Cancel</button>
                        </div>
                    )
                }
            </div>

            {upcoming.length === 0
                ? <p class="empty-hint">No upcoming programmes from this channel.</p>
                : (
                    <section class="channel-section">
                        <h2>Upcoming</h2>
                        {upcoming.map(p => (
                            <div key={p.id} class="prog-row prog-row-clickable"
                                onClick={() => showSubscriptionProgramme(channelId, p.id)}>
                                <div class="prog-row-info">
                                    <span class="prog-row-name">{p.name}</span>
                                    <span class={`prog-row-date${p.scheduled_date === t ? ' prog-item-today' : ''}`}>
                                        {p.scheduled_date === t ? 'Today' : formatDate(p.scheduled_date)}
                                    </span>
                                </div>
                                <span class="home-row-arrow">›</span>
                            </div>
                        ))}
                    </section>
                )
            }

            {past.length > 0 && (
                <section class="channel-section channel-section-past">
                    <h2>Past</h2>
                    {past.map(p => (
                        <div key={p.id} class="prog-row prog-row-clickable"
                            onClick={() => showSubscriptionProgramme(channelId, p.id)}>
                            <div class="prog-row-info">
                                <span class="prog-row-name">{p.name}</span>
                                <span class="prog-row-date">{formatDate(p.scheduled_date)}</span>
                            </div>
                            <span class="home-row-arrow">›</span>
                        </div>
                    ))}
                </section>
            )}
        </div>
    );
}
