import { useState } from 'preact/hooks';
import { unsubscribe, showHome } from '../store/dashboard.js';

function today() { return new Date().toISOString().slice(0, 10); }

function formatDate(iso) {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function SubscriptionView({ channelId, subscriptions }) {
    const [confirming, setConfirming] = useState(false);
    const [removing, setRemoving] = useState(false);

    const sub = subscriptions.value.find(s => s.channel_id === channelId);
    if (!sub) return <div class="main-content"><p>Subscription not found.</p></div>;

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

            {upcoming.length > 0 && (
                <section class="channel-section">
                    <h2>Upcoming</h2>
                    {upcoming.map(p => (
                        <div key={p.id} class="prog-row">
                            <span class="prog-row-name">{p.name}</span>
                            <span class={`prog-row-date${p.scheduled_date === t ? ' prog-item-today' : ''}`}>
                                {p.scheduled_date === t ? 'Today' : formatDate(p.scheduled_date)}
                            </span>
                        </div>
                    ))}
                </section>
            )}

            {upcoming.length === 0 && (
                <p class="empty-hint">No upcoming programmes from this channel.</p>
            )}

            {past.length > 0 && (
                <section class="channel-section channel-section-past">
                    <h2>Past</h2>
                    {past.map(p => (
                        <div key={p.id} class="prog-row prog-row-past">
                            <span class="prog-row-name">{p.name}</span>
                            <span class="prog-row-date">{formatDate(p.scheduled_date)}</span>
                        </div>
                    ))}
                </section>
            )}
        </div>
    );
}
