async function req(method, path, body) {
    const opts = { method, headers: {} };
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

// Programme builder (flat CRUD via legacy default-channel bridge)
export const api = {
    list:   ()         => req('GET',    '/api/private/programmes'),
    create: (doc)      => req('POST',   '/api/private/programmes', doc),
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
    getChannelProgrammes: (channel_id) =>
        req('GET', `/api/channels/${channel_id}/programmes`),
    getSubscribers: (channel_id) =>
        req('GET', `/api/channels/${channel_id}/subscribers`),
    createProgramme: (channel_id, doc) =>
        req('POST', `/api/channels/${channel_id}/programmes`, doc),
    updateProgramme: (id, doc) =>
        req('PUT', `/api/programmes/${id}`, doc),
    deleteProgramme: (id) =>
        req('DELETE', `/api/private/programmes/${id}`),
    getPropagation:  (programme_id) =>
        req('GET', `/api/programmes/${programme_id}/propagation`),
};

// Participant
export const participantApi = {
    getChannel:      (channelId)              => req('GET',    `/api/channels/${channelId}`),
    subscribe:       (channelId, account_id)  => req('POST',   `/api/channels/${channelId}/subscribe`, { account_id }),
    unsubscribe:     (channelId, account_id)  => req('DELETE', `/api/channels/${channelId}/subscribe`, { account_id }),
    registerDevice:  (account_id, device_code) => req('POST',  '/api/devices', { account_id, device_code }),
    getDevices:      (account_id)             => req('GET',    `/api/accounts/${account_id}/devices`),
    getSubscriptions:(account_id)             => req('GET',    `/api/accounts/${account_id}/subscriptions`),
    startSession:    (device_code, programme_id) => req('POST', '/api/sessions/start', { device_code, programme_id }),
};
