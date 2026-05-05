import { useState } from 'preact/hooks';
import { accountId } from '../store/auth.js';
import { participantApi } from '../store/api.js';
import { showChannel, showSubscription } from '../store/dashboard.js';
import { channels } from '../store/channels.js';
import { subscriptions } from '../store/subscriptions.js';
import { devices, loadDevices } from '../store/devices.js';
import { openConfirmUnsubscribe, openConfirmRemoveDevice, openNewChannel, openRegisterDevice } from '../store/modal.js';

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
            await loadDevices();
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
                <li>On your watch, start a Run activity, then go to <strong>Settings → Data Screens → Add New Screen</strong> and select Leadout as the <strong>only data field</strong> (full-screen layout)</li>
                <li>Open that data screen — it shows a short device code</li>
                <li>Enter the code below to link your watch to this account</li>
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
    const name = device.device_type_name;
    const image = device.device_type_image;
    return (
        <div class="home-row">
            {image && <img class="device-thumb" src={image} alt={name || device.device_code} />}
            <div class="home-row-main">
                <span class="home-row-name">
                    {name ?? <span style="font-family: monospace; letter-spacing: 0.1em">{device.device_code}</span>}
                    {name && <span class="device-code-badge">{device.device_code}</span>}
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


function WeekCalendar() {
    const subs = subscriptions.value;
    const chs  = channels.value;
    const t = today();

    const progMap = new Map();
    for (const sub of subs) {
        for (const p of (sub.programmes ?? [])) {
            if (!progMap.has(p.id))
                progMap.set(p.id, { name: p.name, date: p.scheduled_date, onClick: () => showSubscription(sub.channel_id) });
        }
    }
    for (const ch of chs) {
        for (const p of (ch.programmes ?? [])) {
            if (!progMap.has(p.id))
                progMap.set(p.id, { name: p.name, date: p.scheduled_date, onClick: () => showChannel(ch.id) });
        }
    }

    const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() + i);
        return d.toISOString().slice(0, 10);
    });

    return (
        <section class="home-section">
            <h2 class="home-section-title">This week</h2>
            <div class="week-calendar">
                {days.map(date => {
                    const isToday = date === t;
                    const d = new Date(date + 'T00:00:00');
                    const dayProgs = [...progMap.values()].filter(p => p.date === date);
                    return (
                        <div key={date} class={`cal-day${isToday ? ' cal-day-today' : ''}`}>
                            <div class="cal-day-header">
                                <span class="cal-day-name">{isToday ? 'Today' : d.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
                                <span class="cal-day-num">{d.getDate()}</span>
                            </div>
                            <div class="cal-day-body">
                                {dayProgs.map((p, i) => (
                                    <div key={i} class="cal-prog" onClick={p.onClick}>{p.name}</div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
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

            {(subs.length > 0 || chs.length > 0) && <WeekCalendar />}

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
                        <button class="btn-ghost btn-sm" onClick={openRegisterDevice}>+ Register another</button>
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
                    <button class="btn-ghost btn-sm" onClick={openNewChannel}>+ New channel</button>
                </div>
                <p class="home-section-desc">
                    Channels you manage as an instructor — create programmes here for your subscribers.
                </p>
                {chs.length === 0
                    ? <p class="empty-hint">No channels yet. Create one to start publishing programmes.</p>
                    : chs.map(ch => <ChannelRow key={ch.id} ch={ch} />)
                }
            </section>

        </div>
    );
}
