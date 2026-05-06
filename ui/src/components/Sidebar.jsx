import { useState, useEffect } from 'preact/hooks';
import { signOut } from '../store/auth.js';
import { openExternalProgramme } from '../store/programmes.js';
import { currentView, showChannel, showSubscription, showSubscriptionProgramme, showHome, showProgrammeEditor, showSetup, showAdmin } from '../store/dashboard.js';
import { channels } from '../store/channels.js';
import { subscriptions } from '../store/subscriptions.js';
import { devices } from '../store/devices.js';
import { isAdmin } from '../store/admin.js';

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
                    onClick={() => {
                            openExternalProgramme(p);
                            showProgrammeEditor(p.id, ch.id)
                        }
                    }
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
                <div key={p.id} class="prog-item prog-item-nested prog-item-sub"
                    onClick={() => showSubscriptionProgramme(sub.channel_id, p.id)}>
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
    const name = device.device_type_name;
    return (
        <div class="sidebar-device-item">
            <div class="sidebar-device-item-row">
                <span class="sidebar-device-code">
                    {name ?? device.device_code}
                    {name && <span class="sidebar-device-code-badge">{device.device_code}</span>}
                </span>
            </div>
            <span data-testid="device-last-synced" class="sidebar-device-meta">
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

            {/* ── Participant: subscriptions ───────────────────────────── */}
            <div class="sidebar-section">
                <div class="sidebar-section-title">My subscriptions</div>
                {subscriptions.value.length === 0
                    ? <div class="sidebar-empty">No subscriptions yet</div>
                    : subscriptions.value.map(sub => <SubscriptionItem key={sub.id} sub={sub} />)
                }
            </div>

            {/* ── Participant: devices ─────────────────────────────────── */}
            <div class="sidebar-section">
                <div class="sidebar-section-title">My devices</div>
                {devices.value.length === 0
                    ? <div class="sidebar-empty">No devices registered</div>
                    : devices.value.map(d => <DeviceItem key={d.id} device={d} />)
                }
            </div>

            {/* ── Instructor: my channels ──────────────────────────────── */}
            <div class="sidebar-section">
                <div class="sidebar-section-title">My channels</div>
                {channels.value.length === 0
                    ? <div class="sidebar-empty">No channels yet</div>
                    : channels.value.map(ch => <ChannelItem key={ch.id} ch={ch} />)
                }
            </div>

            {/* ── Help ─────────────────────────────────────────────────── */}
            <div class="sidebar-section">
                <div class="sidebar-section-title">Help</div>
                <button class="btn-add" onClick={() => { showSetup(); close(); }}>
                    Getting started
                </button>
            </div>

            {/* ── Admin ─────────────────────────────────────────────────── */}
            {isAdmin.value && (
                <div class="sidebar-section">
                    <div class="sidebar-section-title">Admin</div>
                    <button class="btn-add" onClick={() => { showAdmin(); close(); }}>
                        Admin panel
                    </button>
                </div>
            )}

            <div class="sidebar-footer">
                <button class="btn-ghost sidebar-signout" onClick={() => { signOut(); close(); }}>
                    Sign out
                </button>
                <a class="sidebar-privacy-link" href="/privacy">Privacy</a>
            </div>
        </aside>
        {open && <div class="sidebar-backdrop" onClick={close} />}
        </>
    );
}
