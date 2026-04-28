import { useState, useEffect } from 'preact/hooks';
import { accountId, signOut, isSignedIn } from '../store/auth.js';
import {
    channels, subscriptions, devices, currentView,
    createChannel, showChannel, showSubscription, showHome,
    unsubscribe, removeDevice,
} from '../store/dashboard.js';
import { GoogleSignInButton } from './GoogleSignInButton.jsx';

function today() { return new Date().toISOString().slice(0, 10); }

function formatDate(iso) {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatDateTime(iso) {
    if (!iso) return 'never';
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function NewChannelForm({ onDone }) {
    const [name, setName] = useState('');
    async function submit(e) {
        e.preventDefault();
        if (!name.trim()) return;
        await createChannel(name.trim());
        onDone();
    }
    return (
        <form class="new-channel-form" onSubmit={submit}>
            <input
                autoFocus
                value={name}
                onInput={e => setName(e.target.value)}
                placeholder="Channel name"
            />
            <button type="submit" class="btn-primary btn-sm">Add</button>
            <button type="button" class="btn-ghost btn-sm" onClick={onDone}>Cancel</button>
        </form>
    );
}

function ChannelItem({ ch }) {
    const t = today();
    const isSelected = currentView.value?.type === 'channel' && currentView.value.id === ch.id;
    const upcoming = ch.programmes.filter(p => p.scheduled_date >= t);

    return (
        <div class={`channel-item${isSelected ? ' active' : ''}`}>
            <div class="channel-name" onClick={() => showChannel(ch.id)}>
                <span>{ch.name}</span>
                <span class="channel-meta">{ch.subscriber_count} subscribers</span>
            </div>
            {upcoming.map(p => (
                <div
                    key={p.id}
                    class="prog-item prog-item-nested"
                    onClick={() => showChannel(ch.id)}
                >
                    <span class="prog-item-name">{p.name}</span>
                    <span class={`prog-item-meta${p.scheduled_date === t ? ' prog-item-today' : ''}`}>
                        {p.scheduled_date === t ? 'Today' : formatDate(p.scheduled_date)}
                    </span>
                </div>
            ))}
        </div>
    );
}

function SubscriptionItem({ sub }) {
    const t = today();
    const [busy, setBusy] = useState(false);
    const isSelected = currentView.value?.type === 'subscription' && currentView.value.channel_id === sub.channel_id;

    async function handleUnsubscribe(e) {
        e.stopPropagation();
        setBusy(true);
        try { await unsubscribe(sub.channel_id); } finally { setBusy(false); }
    }

    return (
        <div class={`sub-item${isSelected ? ' active' : ''}`}>
            <div class="sub-item-row" onClick={() => showSubscription(sub.channel_id)}>
                <span class="sub-channel-name">{sub.channel?.name ?? sub.channel_id}</span>
                <button
                    class="btn-icon btn-danger btn-xs"
                    disabled={busy}
                    onClick={handleUnsubscribe}
                    title="Unsubscribe"
                >✕</button>
            </div>
            {sub.programmes?.filter(p => p.scheduled_date >= t).map(p => (
                <div key={p.id} class="prog-item prog-item-nested prog-item-sub">
                    <span class="prog-item-name">{p.name}</span>
                    <span class={`prog-item-meta${p.scheduled_date === t ? ' prog-item-today' : ''}`}>
                        {p.scheduled_date === t ? 'Today' : formatDate(p.scheduled_date)}
                    </span>
                </div>
            ))}
        </div>
    );
}

function DeviceItem({ device }) {
    const [busy, setBusy] = useState(false);

    async function handleRemove() {
        setBusy(true);
        try { await removeDevice(device.id); } finally { setBusy(false); }
    }

    return (
        <div class="sidebar-device-item">
            <div class="sidebar-device-item-row">
                <span class="sidebar-device-code">{device.device_code}</span>
                <button
                    class="btn-icon btn-danger btn-xs"
                    disabled={busy}
                    onClick={handleRemove}
                    title="Remove device"
                >✕</button>
            </div>
            <span class="sidebar-device-meta">
                Synced: {formatDateTime(device.last_synced_at)}
            </span>
        </div>
    );
}

export function Sidebar() {
    const [addingChannel, setAddingChannel] = useState(false);
    const [open, setOpen] = useState(false);

    // Close sidebar when navigating on mobile
    useEffect(() => { setOpen(false); }, [currentView.value]);

    const toggle = () => setOpen(o => !o);
    const close  = () => setOpen(false);

    if (!isSignedIn()) {
        return (
            <>
                <button class="burger" onClick={toggle} aria-label="Menu">☰</button>
                <aside class={`sidebar${open ? ' sidebar-open' : ''}`}>
                    <div class="sidebar-header">
                        <span class="logo" onClick={() => { showHome(); close(); }} style="cursor:pointer">Leadout</span>
                        <button class="btn-ghost btn-sm sidebar-close" onClick={close}>✕</button>
                    </div>
                    <div class="sidebar-signin">
                        <p>Sign in to manage channels and subscriptions.</p>
                        <GoogleSignInButton />
                    </div>
                </aside>
                {open && <div class="sidebar-backdrop" onClick={close} />}
            </>
        );
    }

    return (
        <>
        <button class="burger" onClick={toggle} aria-label="Menu">☰</button>
        <aside class={`sidebar${open ? ' sidebar-open' : ''}`}>
            <div class="sidebar-header">
                <span class="logo" onClick={() => { showHome(); close(); }} style="cursor:pointer">Leadout</span>
                <button class="btn-ghost btn-sm sidebar-close" onClick={() => { signOut(); close(); }} title="Sign out">↩</button>
            </div>

            {/* ── Instructor: my channels ──────────────────────────────── */}
            <div class="sidebar-section">
                <div class="sidebar-section-title">My channels</div>
                {channels.value.map(ch => <ChannelItem key={ch.id} ch={ch} />)}
                {addingChannel
                    ? <NewChannelForm onDone={() => setAddingChannel(false)} />
                    : <button class="btn-ghost btn-add" onClick={() => setAddingChannel(true)}>+ New channel</button>
                }
            </div>

            {/* ── Participant: subscriptions ───────────────────────────── */}
            {subscriptions.value.length > 0 && (
                <div class="sidebar-section">
                    <div class="sidebar-section-title">My subscriptions</div>
                    {subscriptions.value.map(sub => (
                        <SubscriptionItem key={sub.id} sub={sub} />
                    ))}
                </div>
            )}

            {/* ── Participant: devices ─────────────────────────────────── */}
            <div class="sidebar-section">
                <div class="sidebar-section-title">My devices</div>
                {devices.value.map(d => <DeviceItem key={d.id} device={d} />)}
                <a href="/register" class="btn-ghost btn-add">+ Register device</a>
            </div>
        </aside>
        {open && <div class="sidebar-backdrop" onClick={close} />}
        </>
    );
}
