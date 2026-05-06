import { signal } from '@preact/signals';
import { accountId } from './auth.js';
import { participantApi } from './api.js';

export const devices = signal([]);

let _inFlight = null;

export async function loadDevices() {
    if (!accountId.value) return;
    if (_inFlight) return _inFlight;
    _inFlight = (async () => {
        try {
            devices.value = await participantApi.getDevices();
        } finally {
            _inFlight = null;
        }
    })();
    return _inFlight;
}

export async function registerDevice(deviceCode) {
    const clean = deviceCode.trim().toUpperCase();
    try {
        await participantApi.registerDevice(clean);
    } catch (err) {
        throw new Error(
            err.message === 'device_code already registered'
                ? 'This device code is already registered to an account.'
                : err.message
        );
    }
    await loadDevices();
}

export async function removeDevice(device_id) {
    await participantApi.removeDevice(device_id, accountId.value);
    _inFlight = null;
    await loadDevices();
}
