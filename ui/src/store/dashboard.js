import { signal, computed } from '@preact/signals';
import { accountId } from './auth.js';
import { instructorApi, participantApi } from './api.js';

// ── Instructor state ──────────────────────────────────────────────────────────

export const channels = signal([]);  // [{ id, name, programmes: [...], subscriber_count }]

export async function loadChannels() {
    if (!accountId.value) return;
    channels.value = await instructorApi.getChannels(accountId.value);
}

export async function createChannel(name) {
    await instructorApi.createChannel(accountId.value, name);
    await loadChannels();
}

export async function createProgramme(channel_id, doc) {
    await instructorApi.createProgramme(channel_id, doc);
    await loadChannels();
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

// ── Navigation ────────────────────────────────────────────────────────────────
// view: null | { type: 'channel', id } | { type: 'subscription', channel_id }

export const currentView = signal(null);

export function showChannel(id) { currentView.value = { type: 'channel', id }; }
export function showSubscription(channel_id) { currentView.value = { type: 'subscription', channel_id }; }
export function showHome() { currentView.value = null; }
