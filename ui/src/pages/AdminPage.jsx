import { useEffect, useState } from 'preact/hooks';
import { adminAccounts, adminChannels, isAdmin, loadAdminData, adminResetDeviceToken } from '../store/admin.js';
import { showChannel } from '../store/dashboard.js';

function fmt(iso) {
    if (!iso) return 'never';
    return new Date(iso).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function shortId(id) {
    return id ? id.slice(0, 8) : '—';
}

function AdminAccount({ account }) {
    const [resetting, setResetting] = useState(null);

    async function handleResetToken(deviceId) {
        setResetting(deviceId);
        try {
            await adminResetDeviceToken(deviceId);
            await loadAdminData();
        } finally {
            setResetting(null);
        }
    }

    return (
        <div class="admin-card">
            <div class="admin-card-header">
                <span class="admin-card-id" title={account.id}>{shortId(account.id)}</span>
                <span class="muted">joined {fmt(account.created_at)}</span>
            </div>
            <div class="admin-card-body">
                <div class="admin-card-section">
                    <div class="admin-sub-title">Devices ({account.devices.length})</div>
                    {account.devices.length === 0
                        ? <span class="muted">none</span>
                        : account.devices.map(d => (
                            <div key={d.id} class="admin-row">
                                <span>{d.device_type_name ?? ""} {d.device_code}</span>
                                <span class="muted">
                                    {d.app_version ?? '—'} · {d.distance_units ?? '—'} · synced {fmt(d.last_synced_at)}
                                </span>
                                <button
                                    class="btn-danger"
                                    disabled={resetting === d.id}
                                    onClick={() => handleResetToken(d.id)}
                                >
                                    {resetting === d.id ? 'Resetting…' : 'Reset token'}
                                </button>
                            </div>
                        ))
                    }
                </div>
                <div class="admin-card-section">
                    <div class="admin-sub-title">Subscriptions ({account.subscriptions.length})</div>
                    {account.subscriptions.length === 0
                        ? <span class="muted">none</span>
                        : account.subscriptions.map(sub => (
                            <div key={sub.id} class="admin-row">
                                <span>{sub.channel?.name ?? sub.channel_id}</span>
                            </div>
                        ))
                    }
                </div>
                <div class="admin-card-section">
                    <div class="admin-sub-title">Channels ({account.channels.length})</div>
                    {account.channels.length === 0
                        ? <span class="muted">none</span>
                        : account.channels.map(ch => (
                            <div key={ch.id} class="admin-row">
                                <span>{ch.name}</span>
                                <span class="muted">
                                    {ch.programme_count} programmes · {ch.subscriber_count} subscribers
                                </span>
                            </div>
                        ))
                    }
                </div>
            </div>
        </div>
    );
}

function AdminChannel({ channel }) {
    return (
        <div class="admin-card">
            <div class="admin-card-header">
                <button class="admin-card-name admin-card-link" onClick={() => showChannel(channel.id)}>{channel.name}</button>
                <span class="muted">
                    {channel.subscribers.length} subscribers · {channel.programmes.length} programmes
                </span>
            </div>
            <div class="admin-card-body">
                <div class="admin-card-section">
                    <div class="admin-sub-title">Subscribers</div>
                    {channel.subscribers.length === 0
                        ? <span class="muted">none</span>
                        : channel.subscribers.map(sub => (
                            <div key={sub.id} class="admin-row">
                                <span class="admin-card-id" title={sub.account_id}>{shortId(sub.account_id)}</span>
                            </div>
                        ))
                    }
                </div>
                <div class="admin-card-section">
                    <div class="admin-sub-title">Programmes</div>
                    {channel.programmes.length === 0
                        ? <span class="muted">none</span>
                        : channel.programmes.map(p => (
                            <div key={p.id} class="admin-row">
                                <span>{p.name}</span>
                                <span class="muted">{p.scheduled_date}</span>
                                <span class="muted">{p.participation_count} started</span>
                            </div>
                        ))
                    }
                </div>
            </div>
        </div>
    );
}

function AdminSummary() {
    const accounts = adminAccounts.value;
    const channels = adminChannels.value;

    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    let syncOk = 0, syncNotOk = 0;
    const versionCounts = {};
    for (const account of accounts) {
        for (const device of account.devices) {
            const v = device.app_version ?? '(unknown)';
            versionCounts[v] = (versionCounts[v] ?? 0) + 1;
            if (device.last_synced_at && new Date(device.last_synced_at).getTime() >= cutoff) {
                syncOk++;
            } else {
                syncNotOk++;
            }
        }
    }
    const totalDevices = syncOk + syncNotOk;
    const totalProgrammes = channels.reduce((n, ch) => n + ch.programmes.length, 0);
    const versions = Object.entries(versionCounts).sort(([a], [b]) => b.localeCompare(a));

    return (
        <div class="admin-summary">
            <a class="admin-stat admin-stat-link" href="#accounts">
                <span class="admin-stat-value">{accounts.length}</span>
                <span class="admin-stat-label">Accounts</span>
            </a>
            <div class="admin-stat">
                <span class="admin-stat-value">{totalDevices}</span>
                <span class="admin-stat-label">Devices</span>
            </div>
            {totalDevices > 0 && (
                <div class="admin-stat">
                    <span class="admin-stat-value admin-stat-ok">{syncOk}</span>
                    <span class="admin-stat-label">Synced (24h)</span>
                </div>
            )}
            {totalDevices > 0 && syncNotOk > 0 && (
                <div class="admin-stat">
                    <span class="admin-stat-value admin-stat-notok">{syncNotOk}</span>
                    <span class="admin-stat-label">Not synced</span>
                </div>
            )}
            <a class="admin-stat admin-stat-link" href="#channels">
                <span class="admin-stat-value">{channels.length}</span>
                <span class="admin-stat-label">Channels</span>
            </a>
            <div class="admin-stat">
                <span class="admin-stat-value">{totalProgrammes}</span>
                <span class="admin-stat-label">Programmes</span>
            </div>
            {versions.length > 0 && (
                <div class="admin-stat admin-stat-versions">
                    <span class="admin-stat-label">App versions</span>
                    <div class="admin-version-list">
                        {versions.map(([v, count]) => (
                            <div key={v} class="admin-version-row">
                                <span class="admin-version-name">{v}</span>
                                <span class="admin-version-count">{count}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export function AdminPage() {
    const [error, setError] = useState(null);

    useEffect(() => {
        loadAdminData().catch(err => {
            setError(err.status === 403 ? 'Access denied.' : 'Failed to load admin data.');
        });
    }, []);

    if (error) {
        return (
            <div class="main-content">
                <p class="muted">{error}</p>
            </div>
        );
    }

    if (!isAdmin.value) {
        return <div class="main-content"><p class="loading">Loading…</p></div>;
    }

    return (
        <div class="main-content admin-page">
            <h1 class="admin-heading">Admin</h1>

            <AdminSummary />

            <section id="accounts" class="admin-section">
                <h2 class="admin-section-title">
                    Accounts <span class="admin-count">({adminAccounts.value.length})</span>
                </h2>
                {adminAccounts.value.length === 0
                    ? <p class="muted">No accounts yet.</p>
                    : adminAccounts.value.map(a => <AdminAccount key={a.id} account={a} />)
                }
            </section>

            <section id="channels" class="admin-section">
                <h2 class="admin-section-title">
                    Channels <span class="admin-count">({adminChannels.value.length})</span>
                </h2>
                {adminChannels.value.length === 0
                    ? <p class="muted">No channels yet.</p>
                    : adminChannels.value.map(ch => <AdminChannel key={ch.id} channel={ch} />)
                }
            </section>
        </div>
    );
}
