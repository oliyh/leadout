import { useState } from 'preact/hooks';
import { accountId } from '../store/auth.js';
import { participantApi } from '../store/api.js';
import {
    channels, subscriptions, devices,
    loadParticipantData, showChannel, showSubscription, createChannel,
} from '../store/dashboard.js';
import { openConfirmUnsubscribe, openConfirmRemoveDevice } from '../store/modal.js';

function today() { return new Date().toISOString().slice(0, 10); }

function formatDate(iso) {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function RegisterForm() {
    const [code, setCode] = useState('');
    const [error, setError] = useState(null);
    const [done, setDone] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    async function submit(e) {
        e.preventDefault();
        const clean = code.trim().toUpperCase();
        if (!clean) return;
        setSubmitting(true);
        setError(null);
        try {
            await participantApi.registerDevice(accountId.value, clean);
            await loadParticipantData();
            setDone(true);
        } catch (err) {
            setError(err.message === 'device_code already registered'
                ? 'This device code is already registered to an account.'
                : err.message);
        } finally {
            setSubmitting(false);
        }
    }

    if (done) return (
        <p class="home-register-success">Watch registered! It will sync programmes on its next connection.</p>
    );

    return (
        <form class="home-register-form" onSubmit={submit}>
            <ol class="onboarding-steps">
                <li>Install the Leadout data field from the Garmin Connect IQ Store</li>
                <li>Add it as a data field on a run activity and start a run</li>
                <li>The data field shows a short device code — enter it below</li>
            </ol>
            <div class="home-register-row">
                <input
                    class="device-code-input"
                    value={code}
                    onInput={e => setCode(e.target.value.toUpperCase())}
                    placeholder="e.g. A1B2C3"
                    maxLength={16}
                    autoCapitalize="characters"
                    spellCheck={false}
                />
                <button type="submit" class="btn-primary" disabled={submitting || !code.trim()}>
                    {submitting ? 'Registering…' : 'Register'}
                </button>
            </div>
            {error && <p class="error">{error}</p>}
        </form>
    );
}

function SubscriptionRow({ sub }) {
    const t = today();
    const upcoming = (sub.programmes ?? []).filter(p => p.scheduled_date >= t);
    return (
        <div class="home-row">
            <div class="home-row-main home-row-clickable" onClick={() => showSubscription(sub.channel_id)}>
                <span class="home-row-name">{sub.channel?.name ?? sub.channel_id}</span>
                <span class="home-row-meta">
                    {upcoming.length === 0
                        ? 'No upcoming programmes'
                        : upcoming[0].scheduled_date === t
                            ? `Today: ${upcoming[0].name}`
                            : `Next: ${upcoming[0].name} · ${formatDate(upcoming[0].scheduled_date)}`
                    }
                </span>
            </div>
            <div class="home-row-actions">
                <button class="btn-ghost btn-sm"
                    onClick={() => openConfirmUnsubscribe(sub.channel_id, sub.channel?.name ?? sub.channel_id)}>
                    Unsubscribe
                </button>
                <span class="home-row-arrow" onClick={() => showSubscription(sub.channel_id)}>›</span>
            </div>
        </div>
    );
}

function DeviceRow({ device }) {
    return (
        <div class="home-row">
            <div class="home-row-main">
                <span class="home-row-name" style="font-family: monospace; letter-spacing: 0.1em">
                    {device.device_code}
                </span>
                <span class="home-row-meta">
                    {device.last_synced_at
                        ? `Last synced ${new Date(device.last_synced_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                        : `Registered ${new Date(device.registered_at).toLocaleDateString('en-GB')}`
                    }
                </span>
            </div>
            <button class="btn-ghost btn-sm"
                onClick={() => openConfirmRemoveDevice(device.id, device.device_code)}>
                Remove
            </button>
        </div>
    );
}

function NewChannelForm({ onDone }) {
    const [name, setName] = useState('');
    const [submitting, setSubmitting] = useState(false);
    async function submit(e) {
        e.preventDefault();
        if (!name.trim()) return;
        setSubmitting(true);
        await createChannel(name.trim());
        onDone();
    }
    return (
        <form class="home-register-form" onSubmit={submit}>
            <div class="home-register-row">
                <input
                    autoFocus
                    value={name}
                    onInput={e => setName(e.target.value)}
                    placeholder="Channel name"
                />
                <button type="submit" class="btn-primary" disabled={submitting || !name.trim()}>
                    {submitting ? 'Creating…' : 'Create'}
                </button>
                <button type="button" class="btn-ghost" onClick={onDone}>Cancel</button>
            </div>
        </form>
    );
}

function ChannelRow({ ch }) {
    const t = today();
    const upcoming = (ch.programmes ?? []).filter(p => p.scheduled_date >= t);
    return (
        <div class="home-row home-row-clickable" onClick={() => showChannel(ch.id)}>
            <div class="home-row-main">
                <span class="home-row-name">{ch.name}</span>
                <span class="home-row-meta">
                    {ch.subscriber_count} subscriber{ch.subscriber_count !== 1 ? 's' : ''}
                    {upcoming.length > 0 && ` · ${upcoming.length} upcoming`}
                </span>
            </div>
            <span class="home-row-arrow">›</span>
        </div>
    );
}

export function HomePage() {
    const [addingChannel, setAddingChannel] = useState(false);
    const devs = devices.value;
    const subs = subscriptions.value;
    const chs  = channels.value;
    const noDevices = devs.length === 0;

    return (
        <div class="main-content home-page">

            {noDevices && (
                <section class="home-section home-section-cta">
                    <h2 class="home-section-title">Register your watch</h2>
                    <p class="home-section-desc">
                        Link your Garmin watch to your account so it can receive session programmes automatically.
                    </p>
                    <RegisterForm />
                </section>
            )}

            <section class="home-section">
                <h2 class="home-section-title">My subscriptions</h2>
                <p class="home-section-desc">
                    Channels you follow — upcoming programmes from these sync to your watch before each session.
                </p>
                {subs.length === 0
                    ? <p class="empty-hint">No subscriptions yet. Ask your instructor for a join link.</p>
                    : subs.map(sub => <SubscriptionRow key={sub.id} sub={sub} />)
                }
            </section>

            {!noDevices && (
                <section class="home-section">
                    <div class="home-section-header">
                        <h2 class="home-section-title">My devices</h2>
                        <a href="/register" class="btn-ghost btn-sm">+ Register another</a>
                    </div>
                    <p class="home-section-desc">
                        Garmin watches linked to your account — each device syncs programmes independently.
                    </p>
                    {devs.map(d => <DeviceRow key={d.id} device={d} />)}
                </section>
            )}

            <section class="home-section">
                <div class="home-section-header">
                    <h2 class="home-section-title">My channels</h2>
                    {!addingChannel && (
                        <button class="btn-ghost btn-sm" onClick={() => setAddingChannel(true)}>+ New channel</button>
                    )}
                </div>
                <p class="home-section-desc">
                    Channels you manage as an instructor — create programmes here for your subscribers.
                </p>
                {chs.map(ch => <ChannelRow key={ch.id} ch={ch} />)}
                {addingChannel
                    ? <NewChannelForm onDone={() => setAddingChannel(false)} />
                    : chs.length === 0 && <p class="empty-hint">No channels yet. Create one to start publishing programmes.</p>
                }
            </section>

        </div>
    );
}
