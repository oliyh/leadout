import { signal, effect } from '@preact/signals';
import { accountId } from './auth.js';
import { instructorApi, participantApi } from './api.js';

// ── Instructor state ──────────────────────────────────────────────────────────

export const channels = signal([]);  // [{ id, name, programmes: [...], subscriber_count }]

export async function loadChannels() {
    if (!accountId.value) return;
    channels.value = await instructorApi.getChannels(accountId.value);
}

export async function createChannel(name) {
    const channel = await instructorApi.createChannel(accountId.value, name);
    await Promise.all([loadChannels(), loadParticipantData()]);
    return channel;
}

export async function createProgramme(channel_id, doc) {
    const prog = await instructorApi.createProgramme(channel_id, doc);
    await Promise.all([loadChannels(), loadParticipantData()]);
    return prog;
}

// ── Participant state ─────────────────────────────────────────────────────────

export const devices = signal([]);       // [{ id, device_code, registered_at }]
export const subscriptions = signal([]); // [{ id, channel_id, channel, programmes }]

export async function loadParticipantData() {
    if (!accountId.value) return;
    const [devs, subs] = await Promise.all([
        participantApi.getDevices(accountId.value),
        participantApi.getSubscriptions(accountId.value),
    ]);
    devices.value = devs;
    subscriptions.value = subs;
}

export async function unsubscribe(channel_id) {
    await participantApi.unsubscribe(channel_id, accountId.value);
    await loadParticipantData();
}

export async function removeDevice(device_id) {
    await participantApi.removeDevice(device_id, accountId.value);
    await loadParticipantData();
}

// ── Navigation ────────────────────────────────────────────────────────────────
// view:
//   null                                    → home
//   { type: 'channel',      id }            → channel page
//   { type: 'programme',    id, channel_id} → programme editor
//   { type: 'subscription', channel_id }    → subscription view

function viewFromURL() {
    const p = window.location.pathname;
    let m;
    if ((m = p.match(/^\/channels\/([^/]+)$/)))                        return { type: 'channel', id: m[1] };
    if ((m = p.match(/^\/subscriptions\/([^/]+)$/)))                   return { type: 'subscription', channel_id: m[1] };
    if ((m = p.match(/^\/subscriptions\/([^/]+)\/programme\/([^/]+)/))) return { type: 'subscription', channel_id: m[1], programme_id: m[2] };
    // Programme editor view is not restored on hard refresh (needs in-memory data).
    return null;
}

export const currentView = signal(viewFromURL());

// Keep browser URL in sync with currentView.
// Skip rewrite on standalone pages that manage their own URL space.
effect(() => {
    const current = window.location.pathname;
    if (current.startsWith('/join/') || current.startsWith('/register') || current.startsWith('/privacy')) return;
    const view = currentView.value;
    let url = '/';
    if (view?.type === 'channel')           url = `/channels/${view.id}`;
    else if (view?.type === 'subscription' && view.programme_id)
                                            url = `/subscriptions/${view.channel_id}/programme/${view.programme_id}`;
    else if (view?.type === 'subscription') url = `/subscriptions/${view.channel_id}`;
    else if (view?.type === 'programme')    url = `/channels/${view.channel_id}/programme/${view.id}`;
    if (current !== url) history.pushState(null, '', url);
});

// Handle browser back / forward.
window.addEventListener('popstate', () => { currentView.value = viewFromURL(); });

export function showChannel(id)            { currentView.value = { type: 'channel', id }; }
export function showSubscription(channel_id) { currentView.value = { type: 'subscription', channel_id }; }
export function showSubscriptionProgramme(channel_id, programme_id) { currentView.value = { type: 'subscription', channel_id, programme_id }; }
export function showProgrammeEditor(id, channel_id) { currentView.value = { type: 'programme', id, channel_id }; }
export function showHome()                 { currentView.value = null; }

// Poll subscription data every minute so upcoming programmes stay fresh.
setInterval(() => {
    if (subscriptions.value.length > 0) loadParticipantData();
}, 60_000);
