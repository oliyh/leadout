import { useState, useEffect } from 'preact/hooks';
import { accountId, signOut, isSignedIn } from '../store/auth.js';
import {
    channels, subscriptions, devices, currentView,
    showChannel, showSubscription, showHome,
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
    const isSelected = currentView.value?.type === 'subscription' && currentView.value.channel_id === sub.channel_id;

    return (
        <div class={`sub-item${isSelected ? ' active' : ''}`}>
            <div class="sub-item-row" onClick={() => showSubscription(sub.channel_id)}>
                <span class="sub-channel-name">{sub.channel?.name ?? sub.channel_id}</span>
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
    return (
        <div class="sidebar-device-item">
            <div class="sidebar-device-item-row">
                <span class="sidebar-device-code">{device.device_code}</span>
            </div>
            <span class="sidebar-device-meta">
                Synced: {formatDateTime(device.last_synced_at)}
            </span>
        </div>
    );
}

export function Sidebar() {
    const [open, setOpen] = useState(false);

    // Close sidebar when navigating on mobile
    useEffect(() => { setOpen(false); }, [currentView.value]);

    const toggle = () => setOpen(o => !o);
    const close  = () => setOpen(false);

    if (!isSignedIn()) {
        return (
            <>
                <div class="mobile-header">
                    <button class="burger" onClick={toggle} aria-label="Menu">☰</button>
                    <span class="logo" onClick={() => { showHome(); close(); }} style="cursor:pointer">Leadout</span>
                </div>
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
        <div class="mobile-header">
            <button class="burger" onClick={toggle} aria-label="Menu">☰</button>
            <span class="logo" onClick={() => { showHome(); close(); }} style="cursor:pointer">Leadout</span>
        </div>
        <aside class={`sidebar${open ? ' sidebar-open' : ''}`}>
            <div class="sidebar-header">
                <span class="logo" onClick={() => { showHome(); close(); }} style="cursor:pointer">Leadout</span>
            </div>

            {/* ── Instructor: my channels ──────────────────────────────── */}
            {channels.value.length > 0 && (
                <div class="sidebar-section">
                    <div class="sidebar-section-title">My channels</div>
                    {channels.value.map(ch => <ChannelItem key={ch.id} ch={ch} />)}
                </div>
            )}

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
            {devices.value.length > 0 && (
                <div class="sidebar-section">
                    <div class="sidebar-section-title">My devices</div>
                    {devices.value.map(d => <DeviceItem key={d.id} device={d} />)}
                </div>
            )}

            <div class="sidebar-footer">
                <button class="btn-ghost sidebar-signout" onClick={() => { signOut(); close(); }}>
                    Sign out
                </button>
            </div>
        </aside>
        {open && <div class="sidebar-backdrop" onClick={close} />}
        </>
    );
}
