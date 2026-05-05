import { signal } from '@preact/signals';
import { accountId } from './auth.js';
import { instructorApi } from './api.js';
import { loadSubscriptions } from './subscriptions.js';

export const channels = signal([]);

let _inFlight = null;

export async function loadChannels() {
    if (!accountId.value) return;
    if (_inFlight) return _inFlight;
    _inFlight = (async () => {
        try {
            channels.value = await instructorApi.getChannels(accountId.value);
        } finally {
            _inFlight = null;
        }
    })();
    return _inFlight;
}

export async function createChannel(name) {
    const channel = await instructorApi.createChannel(accountId.value, name);
    _inFlight = null;
    await Promise.all([loadChannels(), loadSubscriptions()]);
    return channel;
}

export async function createProgramme(channel_id, doc) {
    const prog = await instructorApi.createProgramme(channel_id, doc);
    _inFlight = null;
    await Promise.all([loadChannels(), loadSubscriptions()]);
    return prog;
}
