async function req(method, path, body) {
    const opts = { method, headers: {} };
    if (body !== undefined) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    }
    const r = await fetch('/api/private' + path, opts);
    if (r.status === 204) return null;
    const data = await r.json();
    if (!r.ok) throw new Error(data.error ?? r.statusText);
    return data;
}

export const api = {
    list:   ()         => req('GET',    '/programmes'),
    create: (doc)      => req('POST',   '/programmes', doc),
    put:    (id, doc)  => req('PUT',    `/programmes/${id}`, doc),
    remove: (id)       => req('DELETE', `/programmes/${id}`),
};
