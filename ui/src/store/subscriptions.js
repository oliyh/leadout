import { signal } from '@preact/signals';
import { accountId } from './auth.js';
import { participantApi } from './api.js';

export const subscriptions = signal([]);

let _inFlight = null;

export async function loadSubscriptions() {
    if (!accountId.value) return;
    if (_inFlight) return _inFlight;
    _inFlight = (async () => {
        try {
            subscriptions.value = await participantApi.getSubscriptions(accountId.value);
        } finally {
            _inFlight = null;
        }
    })();
    return _inFlight;
}

export async function unsubscribe(channel_id) {
    await participantApi.unsubscribe(channel_id);
    _inFlight = null;
    await loadSubscriptions();
}
