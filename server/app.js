import express from 'express';
import { createHmac } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function today() { return new Date().toISOString().slice(0, 10); }

function wrap(fn) {
    return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// ── Session tokens ────────────────────────────────────────────────────────────
// HMAC-signed opaque token containing the account id.
// Set SESSION_SECRET in the environment; falls back to a dev-only default.

const SESSION_SECRET = process.env.SESSION_SECRET ?? 'dev-secret-change-in-prod';

function signToken(accountId) {
    const payload = Buffer.from(JSON.stringify({ id: accountId })).toString('base64url');
    const sig = createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
    return `${payload}.${sig}`;
}

function verifyToken(token) {
    if (!token) return null;
    const dot = token.lastIndexOf('.');
    if (dot < 0) return null;
    const payload = token.slice(0, dot);
    const sig     = token.slice(dot + 1);
    const expected = createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
    if (sig !== expected) return null;
    try { return JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { return null; }
}

// Verifies the Bearer token and attaches req.authAccountId.
// Returns 401 if the token is absent or invalid.
function requireAuth(req, res, next) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'authentication required' });
    const claims = verifyToken(header.slice(7));
    if (!claims?.id) return res.status(401).json({ error: 'invalid token' });
    req.authAccountId = claims.id;
    next();
}

// ── Garmin device type cache ───────────────────────────────────────────────
// Fetched once from Garmin's app store API; keyed by partNumber (e.g. 006-B2431-00).
// The watch sends System.getDeviceSettings().partNumber on every sync, stored as model_name.

let _deviceTypeMap = null;
let _deviceTypeCacheExpiry = 0;

export function _resetDeviceTypeCacheForTest() {
    _deviceTypeMap = null;
    _deviceTypeCacheExpiry = 0;
}

async function getDeviceTypeMap() {
    const now = Date.now();
    if (_deviceTypeMap && now < _deviceTypeCacheExpiry) return _deviceTypeMap;
    try {
        const r = await fetch('https://apps.garmin.com/api/appsLibraryExternalServices/api/asw/deviceTypes');
        if (!r.ok) return _deviceTypeMap ?? new Map();
        const types = await r.json();
        _deviceTypeMap = new Map(types.map(t => [t.partNumber, t]));
        _deviceTypeCacheExpiry = now + 24 * 60 * 60 * 1000;
        return _deviceTypeMap;
    } catch {
        return _deviceTypeMap ?? new Map();
    }
}

export function createApp(store) {
    const app = express();
    app.use(express.json());

    // ── Test-only auth (NODE_ENV=test) ────────────────────────────────────────
    // Creates or returns an account by google_id without any token verification.
    // Only registered when the server is started in test mode.

    if (process.env.NODE_ENV === 'test') {
        app.post('/api/auth/test', async (req, res) => {
            const { google_id } = req.body;
            if (!google_id) return res.status(400).json({ error: 'google_id required' });
            const account = await store.findOrCreateAccount(google_id);
            res.json({ ...account, token: signToken(account.id) });
        });

        app.post('/api/test/reset', async (_req, res) => {
            await store.reset();
            res.json({ ok: true });
        });
    }

    // ── Auth: verify Google id_token ──────────────────────────────────────────
    // Accepts a real Google id_token JWT from Google Identity Services.
    // Verifies via Google's tokeninfo endpoint, extracts the stable `sub` claim.
    // GOOGLE_CLIENT_ID must be set — tokens issued for other OAuth clients are rejected.

    app.post('/api/auth/google-token', async (req, res) => {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        if (!clientId) return res.status(500).json({ error: 'server misconfigured' });
        const { token } = req.body;
        if (!token) return res.status(400).json({ error: 'token required' });
        try {
            const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`);
            if (!r.ok) return res.status(401).json({ error: 'invalid token' });
            const payload = await r.json();
            if (payload.aud !== clientId) {
                return res.status(401).json({ error: 'token audience mismatch' });
            }
            const account = await store.findOrCreateAccount(payload.sub);
            res.json({ ...account, token: signToken(account.id) });
        } catch {
            res.status(500).json({ error: 'auth failed' });
        }
    });

    // ── Device registration (ParticipantRegistersDevice) ──────────────────────
    // A device_code can only be claimed by one account. Rejects duplicates.

    app.post('/api/devices', requireAuth, async (req, res) => {
        const { device_code } = req.body;
        if (!device_code) return res.status(400).json({ error: 'device_code required' });
        if (await store.findDeviceByCode(device_code)) {
            return res.status(409).json({ error: 'device_code already registered' });
        }
        const device = await store.createDevice({
            device_code, account_id: req.authAccountId, registered_at: new Date().toISOString()
        });
        res.status(201).json(device);
    });

    app.delete('/api/devices/:id', requireAuth, wrap(async (req, res) => {
        const device = await store.getDevice(req.params.id);
        if (!device) return res.status(404).json({ error: 'device not found' });
        if (device.account_id !== req.authAccountId) return res.status(403).json({ error: 'forbidden' });
        await store.deleteDevice(req.params.id);
        res.status(204).end();
    }));

    // ── Channel management (InstructorCreatesChannel) ─────────────────────────

    app.post('/api/channels', requireAuth, async (req, res) => {
        const { instructor_oauth_id, name } = req.body;
        if (!instructor_oauth_id || !name) {
            return res.status(400).json({ error: 'instructor_oauth_id and name required' });
        }
        if (req.authAccountId !== instructor_oauth_id) return res.status(403).json({ error: 'forbidden' });
        const channel = await store.createChannel({
            instructor_oauth_id, name, created_at: new Date().toISOString()
        });
        // Instructor is automatically subscribed to their own channel so their
        // watch syncs the programmes they publish.
        if (!await store.findSubscription(instructor_oauth_id, channel.id)) {
            await store.createSubscription({ account_id: instructor_oauth_id, channel_id: channel.id });
        }
        res.status(201).json(channel);
    });

    app.get('/api/channels/:id', async (req, res) => {
        const channel = await store.getChannel(req.params.id);
        channel ? res.json(channel) : res.status(404).end();
    });

    app.put('/api/channels/:id', requireAuth, async (req, res) => {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'name required' });
        const channel = await store.getChannel(req.params.id);
        if (!channel) return res.status(404).end();
        if (channel.instructor_oauth_id !== req.authAccountId) return res.status(403).json({ error: 'forbidden' });
        const updated = await store.updateChannel(req.params.id, { name });
        res.json(updated);
    });

    // ── Subscription (ParticipantSubscribes / ParticipantUnsubscribes) ────────

    app.post('/api/channels/:id/subscribe', requireAuth, async (req, res) => {
        const account_id = req.authAccountId;
        const channel_id = req.params.id;
        if (!await store.getChannel(channel_id)) {
            return res.status(404).json({ error: 'channel not found' });
        }
        if (await store.findSubscription(account_id, channel_id)) {
            return res.status(409).json({ error: 'already subscribed' });
        }
        const sub = await store.createSubscription({ account_id, channel_id });
        res.status(201).json(sub);
    });

    app.delete('/api/channels/:id/subscribe', requireAuth, async (req, res) => {
        const account_id = req.authAccountId;
        const channel_id = req.params.id;
        const deleted = await store.deleteSubscription(account_id, channel_id);
        deleted ? res.status(204).end() : res.status(404).json({ error: 'subscription not found' });
    });

    // ── Account views ─────────────────────────────────────────────────────────

    app.get('/api/accounts/:id/channels', requireAuth, async (req, res) => {
        if (req.authAccountId !== req.params.id) return res.status(403).json({ error: 'forbidden' });
        const channels = await store.findChannelsByInstructor(req.params.id);
        const result = await Promise.all(channels.map(async ch => ({
            ...ch,
            programmes: await store.findProgrammesByChannel(ch.id),
            subscriber_count: (await store.findSubscriptionsByChannel(ch.id)).length,
        })));
        res.json(result);
    });

    app.get('/api/accounts/devices', requireAuth, async (req, res) => {
        const [devices, typeMap] = await Promise.all([
            store.findDevicesByAccount(req.authAccountId),
            getDeviceTypeMap(),
        ]);
        res.json(devices.map(d => {
            const dt = d.model_name ? typeMap.get(d.model_name) : null;
            return { ...d, device_type_name: dt?.name ?? null, device_type_image: dt?.imageUrl ?? null };
        }));
    });

    app.get('/api/accounts/:id/subscriptions', requireAuth, async (req, res) => {
        if (req.authAccountId !== req.params.id) return res.status(403).json({ error: 'forbidden' });
        const subs = await store.findSubscriptionsByAccount(req.params.id);
        const result = await Promise.all(subs.map(async sub => {
            const channel = await store.getChannel(sub.channel_id);
            const programmes = await store.findProgrammesByChannel(sub.channel_id);
            return { ...sub, channel, programmes };
        }));
        res.json(result);
    });

    // ── Channel detail (instructor channel page) ──────────────────────────────

    app.get('/api/channels/:id/programmes', requireAuth, async (req, res) => {
        const _ch = await store.getChannel(req.params.id);
        if (!_ch) return res.status(404).end();
        if (_ch.instructor_oauth_id !== req.authAccountId) return res.status(403).json({ error: 'forbidden' });
        const programmes = await store.findProgrammesByChannel(req.params.id);
        const result = await Promise.all(programmes.map(async prog => ({
            ...prog,
            participation_count: (await store.findParticipationsByProgramme(prog.id)).length,
            sync_count: (await store.findSyncRecordsByProgramme(prog.id)).length,
        })));
        res.json(result);
    });

    app.get('/api/channels/:id/subscribers', requireAuth, async (req, res) => {
        const _ch = await store.getChannel(req.params.id);
        if (!_ch) return res.status(404).end();
        if (_ch.instructor_oauth_id !== req.authAccountId) return res.status(403).json({ error: 'forbidden' });
        res.json(await store.findSubscriptionsByChannel(req.params.id));
    });

    // ── Participation (ParticipantStartsSession) ──────────────────────────────

    app.post('/api/sessions/start', async (req, res) => {
        const { device_code, programme_id } = req.body;
        if (!device_code || !programme_id) {
            return res.status(400).json({ error: 'device_code and programme_id required' });
        }
        const device = await store.findDeviceByCode(device_code);
        if (!device) return res.status(404).json({ error: 'device not registered' });
        if (!await store.getProgramme(programme_id)) {
            return res.status(404).json({ error: 'programme not found' });
        }
        const part = await store.createParticipation({
            device_id: device.id, programme_id, started_at: new Date().toISOString()
        });
        res.status(201).json(part);
    });

    // ── Programme management ──────────────────────────────────────────────────

    app.post('/api/channels/:id/programmes', requireAuth, async (req, res) => {
        const channel_id = req.params.id;
        const _ch = await store.getChannel(channel_id);
        if (!_ch) return res.status(404).json({ error: 'channel not found' });
        if (_ch.instructor_oauth_id !== req.authAccountId) return res.status(403).json({ error: 'forbidden' });
        const now = new Date().toISOString();
        const { name, scheduled_date, pace_assumption, blocks } = req.body;
        const prog = await store.createProgramme({
            channel_id,
            name,
            scheduled_date:  scheduled_date || today(),
            pace_assumption: pace_assumption || 330,
            blocks:          blocks || [],
            published_at:    now,
            updated_at:      now,
        });
        res.status(201).json(prog);
    });

    // ── Watch sync API (DevicePollsServer) ────────────────────────────────────
    // RegisteredDevicePoll: returns non-expired programmes from all subscribed
    // channels; creates/updates ProgrammeSyncRecord per programme.
    // UnregisteredDevicePoll: returns 404 with registration_required.

    app.get('/api/sync/:device_code', async (req, res) => {
        const device = await store.findDeviceByCode(req.params.device_code);
        if (!device) {
            return res.status(404).json({ error: 'registration_required' });
        }

        const deviceUpdates = { last_synced_at: new Date().toISOString() };
        if (req.query.model)           deviceUpdates.model_name      = req.query.model;
        if (req.query.app_version)     deviceUpdates.app_version     = req.query.app_version;
        if (req.query.distance_units)  deviceUpdates.distance_units  = req.query.distance_units;
        await store.updateDevice(device.id, deviceUpdates);

        const subs = await store.findSubscriptionsByAccount(device.account_id);
        const programmes = [];
        const t = today();

        for (const sub of subs) {
            const channelProgs = await store.findProgrammesByChannel(sub.channel_id);
            for (const prog of channelProgs) {
                if (prog.scheduled_date >= t) {
                    programmes.push(prog);
                    await store.upsertSyncRecord({
                        device_id:         device.id,
                        programme_id:      prog.id,
                        synced_at:         new Date().toISOString(),
                        programme_version: prog.updated_at,
                    });
                }
            }
        }

        res.json({ programmes, subscription_count: subs.length });
    });

    // ── Instructor sync propagation view ──────────────────────────────────────

    app.get('/api/programmes/:id/propagation', requireAuth, async (req, res) => {
        const prog = await store.getProgramme(req.params.id);
        if (!prog) return res.status(404).end();
        const _ch = await store.getChannel(prog.channel_id);
        if (!_ch || _ch.instructor_oauth_id !== req.authAccountId) return res.status(403).json({ error: 'forbidden' });
        const records = await store.findSyncRecordsByProgramme(prog.id);
        res.json({
            programme_id: prog.id,
            updated_at:   prog.updated_at,
            sync_records: records.map(r => ({
                device_id:         r.device_id,
                synced_at:         r.synced_at,
                programme_version: r.programme_version,
                is_current:        r.programme_version === prog.updated_at,
            })),
        });
    });

    // ── Programme editor save/delete ──────────────────────────────────────────

    const priv = express.Router();
    priv.use(requireAuth);

    priv.put('/programmes/:id', async (req, res) => {
        const prog = await store.getProgramme(req.params.id);
        if (!prog) return res.status(404).end();
        const _ch = await store.getChannel(prog.channel_id);
        if (!_ch || _ch.instructor_oauth_id !== req.authAccountId) return res.status(403).json({ error: 'forbidden' });
        if (prog.scheduled_date < today()) return res.status(409).json({ error: 'programme is expired' });
        const { name, scheduled_date, pace_assumption, blocks } = req.body;
        const updated = await store.updateProgramme(req.params.id, {
            ...(name             !== undefined && { name }),
            ...(scheduled_date   !== undefined && { scheduled_date }),
            ...(pace_assumption  !== undefined && { pace_assumption }),
            ...(blocks           !== undefined && { blocks }),
            updated_at: new Date().toISOString(),
        });
        res.json(updated);
    });

    priv.delete('/programmes/:id', async (req, res) => {
        const prog = await store.getProgramme(req.params.id);
        if (!prog) return res.status(404).end();
        const _ch = await store.getChannel(prog.channel_id);
        if (!_ch || _ch.instructor_oauth_id !== req.authAccountId) return res.status(403).json({ error: 'forbidden' });
        const deleted = await store.deleteProgramme(req.params.id);
        deleted ? res.status(204).end() : res.status(404).end();
    });

    app.use('/api/private', priv);

    // ── Admin routes ──────────────────────────────────────────────────────────
    // ADMIN_ACCOUNT_ID env var gates access in deployed envs.
    // When unset (local dev) any existing account is treated as admin.

    async function requireAdmin(req, res, next) {
        const adminId = process.env.ADMIN_ACCOUNT_ID;
        if (adminId) {
            if (req.authAccountId !== adminId) return res.status(403).json({ error: 'forbidden' });
        } else {
            // Local dev: any existing account is admin.
            const account = await store.getAccount(req.authAccountId);
            if (!account) return res.status(403).json({ error: 'account not found' });
        }
        next();
    }

    const admin = express.Router();
    admin.use(requireAuth, requireAdmin);

    admin.get('/access', (_req, res) => {
        res.json({ admin: true });
    });

    admin.get('/accounts', async (_req, res) => {
        const [accounts, typeMap] = await Promise.all([store.getAllAccounts(), getDeviceTypeMap()]);
        const result = await Promise.all(accounts.map(async account => {
            const [devices, subs, channels] = await Promise.all([
                store.findDevicesByAccount(account.id),
                store.findSubscriptionsByAccount(account.id),
                store.findChannelsByInstructor(account.id),
            ]);
            return {
                ...account,
                devices: devices.map(d => ({
                    ...d,
                    device_type_name: d.model_name ? (typeMap.get(d.model_name)?.name ?? null) : null,
                })),
                subscriptions: await Promise.all(subs.map(async sub => ({
                    ...sub,
                    channel: await store.getChannel(sub.channel_id),
                }))),
                channels: await Promise.all(channels.map(async ch => ({
                    ...ch,
                    programme_count:  (await store.findProgrammesByChannel(ch.id)).length,
                    subscriber_count: (await store.findSubscriptionsByChannel(ch.id)).length,
                }))),
            };
        }));
        res.json(result);
    });

    admin.get('/channels', async (_req, res) => {
        const channels = await store.getAllChannels();
        const result = await Promise.all(channels.map(async ch => {
            const [programmes, subs] = await Promise.all([
                store.findProgrammesByChannel(ch.id),
                store.findSubscriptionsByChannel(ch.id),
            ]);
            return { ...ch, programmes, subscribers: subs };
        }));
        res.json(result);
    });

    app.use('/api/admin', admin);

    // ── Static UI + SPA fallback ──────────────────────────────────────────────
    // In production the built UI lives in public/. Unknown paths serve index.html
    // so that client-side routes like /join/:channelId work on hard refresh.

    const publicDir = join(__dirname, 'public');
    app.use(express.static(publicDir));
    app.get('*', (_req, res) => {
        res.sendFile(join(publicDir, 'index.html'));
    });

    // eslint-disable-next-line no-unused-vars
    app.use((err, _req, res, _next) => {
        console.error(err);
        res.status(500).json({ error: 'internal server error' });
    });

    return app;
}
