import { useEffect, useState } from 'preact/hooks';
import { adminAccounts, adminChannels, isAdmin, loadAdminData } from '../store/admin.js';

function fmt(iso) {
    if (!iso) return 'never';
    return new Date(iso).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function AdminAccount({ account }) {
    return (
        <div class="admin-card">
            <div class="admin-card-header">
                <span class="admin-card-id">{account.id}</span>
                <span class="muted">joined {fmt(account.created_at)}</span>
            </div>
            <div class="admin-card-body">
                <div class="admin-card-section">
                    <div class="admin-sub-title">Devices ({account.devices.length})</div>
                    {account.devices.length === 0
                        ? <span class="muted">none</span>
                        : account.devices.map(d => (
                            <div key={d.id} class="admin-row">
                                <span>{d.device_type_name ?? d.device_code}</span>
                                <span class="muted">
                                    {d.app_version ?? '—'} · {d.distance_units ?? '—'} · synced {fmt(d.last_synced_at)}
                                </span>
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
                <span class="admin-card-name">{channel.name}</span>
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
                                <span class="admin-card-id">{sub.account_id}</span>
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
                            </div>
                        ))
                    }
                </div>
            </div>
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

            <section class="admin-section">
                <h2 class="admin-section-title">
                    Accounts <span class="admin-count">({adminAccounts.value.length})</span>
                </h2>
                {adminAccounts.value.length === 0
                    ? <p class="muted">No accounts yet.</p>
                    : adminAccounts.value.map(a => <AdminAccount key={a.id} account={a} />)
                }
            </section>

            <section class="admin-section">
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
