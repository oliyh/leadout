import { getToken } from './auth.js';

async function req(method, path, body) {
    const opts = { method, headers: {} };
    const token = getToken();
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;
    if (body !== undefined) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    }
    const r = await fetch(path, opts);
    if (r.status === 204) return null;
    const data = await r.json();
    if (!r.ok) throw new Error(data.error ?? r.statusText);
    return data;
}

// Programme editor save/delete
export const api = {
    put:    (id, doc)  => req('PUT',    `/api/private/programmes/${id}`, doc),
    remove: (id)       => req('DELETE', `/api/private/programmes/${id}`),
};

// Instructor
export const instructorApi = {
    createChannel:  (account_id, name) =>
        req('POST', '/api/channels', { instructor_oauth_id: account_id, name }),
    getChannels:    (account_id) =>
        req('GET', `/api/accounts/${account_id}/channels`),
    getChannel:     (id) =>
        req('GET', `/api/channels/${id}`),
    updateChannel:  (id, name) =>
        req('PUT', `/api/channels/${id}`, { name }),
    getChannelProgrammes: (channel_id) =>
        req('GET', `/api/channels/${channel_id}/programmes`),
    getSubscribers: (channel_id) =>
        req('GET', `/api/channels/${channel_id}/subscribers`),
    createProgramme: (channel_id, doc) =>
        req('POST', `/api/channels/${channel_id}/programmes`, doc),
    getPropagation:  (programme_id) =>
        req('GET', `/api/programmes/${programme_id}/propagation`),
};

// Participant
export const participantApi = {
    getChannel:      (channelId)              => req('GET',    `/api/channels/${channelId}`),
    subscribe:       (channelId, account_id)  => req('POST',   `/api/channels/${channelId}/subscribe`, { account_id }),
    unsubscribe:     (channelId, account_id)  => req('DELETE', `/api/channels/${channelId}/subscribe`, { account_id }),
    registerDevice:  (device_code)            => req('POST',  '/api/devices', { device_code }),
    getDevices:      ()                       => req('GET',   '/api/accounts/devices'),
    removeDevice:    (device_id, account_id)  => req('DELETE', `/api/devices/${device_id}`, { account_id }),
    getSubscriptions:(account_id)             => req('GET',    `/api/accounts/${account_id}/subscriptions`),
    startSession:    (device_code, programme_id) => req('POST', '/api/sessions/start', { device_code, programme_id }),
};
