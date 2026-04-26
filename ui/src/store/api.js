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

// Programme builder (instructor, flat CRUD via default channel)
export const api = {
    list:   ()         => req('GET',    '/api/private/programmes'),
    create: (doc)      => req('POST',   '/api/private/programmes', doc),
    put:    (id, doc)  => req('PUT',    `/api/private/programmes/${id}`, doc),
    remove: (id)       => req('DELETE', `/api/private/programmes/${id}`),
};

// Participant flows
export const participantApi = {
    getChannel:  (channelId)              => req('GET',  `/api/channels/${channelId}`),
    subscribe:   (channelId, account_id)  => req('POST', `/api/channels/${channelId}/subscribe`, { account_id }),
    registerDevice: (account_id, device_code) => req('POST', '/api/devices', { account_id, device_code }),
};
