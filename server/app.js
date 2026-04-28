import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function today() { return new Date().toISOString().slice(0, 10); }

// Lazily-created default channel for the programme builder.
// Bridges the flat /api/private/programmes API to the channel-based domain model.
let _defaultChannelId = null;
async function defaultChannel(store) {
    if (_defaultChannelId) {
        const ch = await store.getChannel(_defaultChannelId);
        if (ch) return ch;
    }
    const ch = await store.createChannel({
        instructor_oauth_id: 'default',
        name:                'My Channel',
        created_at:          new Date().toISOString(),
    });
    _defaultChannelId = ch.id;
    return ch;
}

export function createApp(store) {
    const app = express();
    app.use(express.json());

    // ── Auth: verify Google id_token ──────────────────────────────────────────
    // Accepts a real Google id_token JWT from Google Identity Services.
    // Verifies via Google's tokeninfo endpoint, extracts the stable `sub` claim.

    app.post('/api/auth/google-token', async (req, res) => {
        const { token } = req.body;
        if (!token) return res.status(400).json({ error: 'token required' });
        try {
            const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`);
            if (!r.ok) return res.status(401).json({ error: 'invalid token' });
            const payload = await r.json();
            const clientId = process.env.GOOGLE_CLIENT_ID;
            if (clientId && payload.aud !== clientId) {
                return res.status(401).json({ error: 'token audience mismatch' });
            }
            const account = await store.findOrCreateAccount(payload.sub);
            res.json(account);
        } catch {
            res.status(500).json({ error: 'auth failed' });
        }
    });

    // ── Participant auth (restoreSession) ─────────────────────────────────────
    // Idempotent: re-authenticates a known google_id without a fresh id_token.
    // Used by the UI on page load to restore a previously-established session.

    app.post('/api/auth/google', async (req, res) => {
        const { google_id } = req.body;
        if (!google_id) return res.status(400).json({ error: 'google_id required' });
        const account = await store.findOrCreateAccount(google_id);
        res.json(account);
    });

    // ── Device registration (ParticipantRegistersDevice) ──────────────────────
    // A device_code can only be claimed by one account. Rejects duplicates.

    app.post('/api/devices', async (req, res) => {
        const { account_id, device_code } = req.body;
        if (!account_id || !device_code) {
            return res.status(400).json({ error: 'account_id and device_code required' });
        }
        if (!await store.getAccount(account_id)) {
            return res.status(404).json({ error: 'account not found' });
        }
        if (await store.findDeviceByCode(device_code)) {
            return res.status(409).json({ error: 'device_code already registered' });
        }
        const device = await store.createDevice({
            device_code, account_id, registered_at: new Date().toISOString()
        });
        res.status(201).json(device);
    });

    app.delete('/api/devices/:id', async (req, res) => {
        const { account_id } = req.body;
        if (!account_id) return res.status(400).json({ error: 'account_id required' });
        const device = await store.getDevice(req.params.id);
        if (!device) return res.status(404).json({ error: 'device not found' });
        if (device.account_id !== account_id) return res.status(403).json({ error: 'forbidden' });
        await store.deleteDevice(req.params.id);
        res.status(204).end();
    });

    // ── Channel management (InstructorCreatesChannel) ─────────────────────────

    app.post('/api/channels', async (req, res) => {
        const { instructor_oauth_id, name } = req.body;
        if (!instructor_oauth_id || !name) {
            return res.status(400).json({ error: 'instructor_oauth_id and name required' });
        }
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

    app.put('/api/channels/:id', async (req, res) => {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'name required' });
        const channel = await store.getChannel(req.params.id);
        if (!channel) return res.status(404).end();
        const updated = await store.updateChannel(req.params.id, { name });
        res.json(updated);
    });

    // ── Subscription (ParticipantSubscribes / ParticipantUnsubscribes) ────────

    app.post('/api/channels/:id/subscribe', async (req, res) => {
        const { account_id } = req.body;
        const channel_id = req.params.id;
        if (!account_id) return res.status(400).json({ error: 'account_id required' });
        if (!await store.getChannel(channel_id)) {
            return res.status(404).json({ error: 'channel not found' });
        }
        if (await store.findSubscription(account_id, channel_id)) {
            return res.status(409).json({ error: 'already subscribed' });
        }
        const sub = await store.createSubscription({ account_id, channel_id });
        res.status(201).json(sub);
    });

    app.delete('/api/channels/:id/subscribe', async (req, res) => {
        const { account_id } = req.body;
        const channel_id = req.params.id;
        if (!account_id) return res.status(400).json({ error: 'account_id required' });
        const deleted = await store.deleteSubscription(account_id, channel_id);
        deleted ? res.status(204).end() : res.status(404).json({ error: 'subscription not found' });
    });

    // ── Account views ─────────────────────────────────────────────────────────

    app.get('/api/accounts/:id/channels', async (req, res) => {
        if (!await store.getAccount(req.params.id)) return res.status(404).end();
        // instructor_oauth_id is the account id (stub auth; will be Garmin userId with real OAuth)
        const channels = await store.findChannelsByInstructor(req.params.id);
        const result = await Promise.all(channels.map(async ch => ({
            ...ch,
            programmes: await store.findProgrammesByChannel(ch.id),
            subscriber_count: (await store.findSubscriptionsByChannel(ch.id)).length,
        })));
        res.json(result);
    });

    app.get('/api/accounts/:id/devices', async (req, res) => {
        if (!await store.getAccount(req.params.id)) return res.status(404).end();
        res.json(await store.findDevicesByAccount(req.params.id));
    });

    app.get('/api/accounts/:id/subscriptions', async (req, res) => {
        if (!await store.getAccount(req.params.id)) return res.status(404).end();
        const subs = await store.findSubscriptionsByAccount(req.params.id);
        const result = await Promise.all(subs.map(async sub => {
            const channel = await store.getChannel(sub.channel_id);
            const programmes = await store.findProgrammesByChannel(sub.channel_id);
            return { ...sub, channel, programmes };
        }));
        res.json(result);
    });

    // ── Channel detail (instructor channel page) ──────────────────────────────

    app.get('/api/channels/:id/programmes', async (req, res) => {
        if (!await store.getChannel(req.params.id)) return res.status(404).end();
        const programmes = await store.findProgrammesByChannel(req.params.id);
        const result = await Promise.all(programmes.map(async prog => ({
            ...prog,
            participation_count: (await store.findParticipationsByProgramme(prog.id)).length,
            sync_count: (await store.findSyncRecordsByProgramme(prog.id)).length,
        })));
        res.json(result);
    });

    app.get('/api/channels/:id/subscribers', async (req, res) => {
        if (!await store.getChannel(req.params.id)) return res.status(404).end();
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

    app.post('/api/channels/:id/programmes', async (req, res) => {
        const channel_id = req.params.id;
        if (!await store.getChannel(channel_id)) {
            return res.status(404).json({ error: 'channel not found' });
        }
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

    app.put('/api/programmes/:id', async (req, res) => {
        const prog = await store.getProgramme(req.params.id);
        if (!prog) return res.status(404).end();
        if (prog.scheduled_date < today()) {
            return res.status(409).json({ error: 'programme is expired' });
        }
        const { name, scheduled_date, pace_assumption, blocks } = req.body;
        const updated = await store.updateProgramme(req.params.id, {
            ...(name            !== undefined && { name }),
            ...(scheduled_date  !== undefined && { scheduled_date }),
            ...(pace_assumption !== undefined && { pace_assumption }),
            ...(blocks          !== undefined && { blocks }),
            updated_at: new Date().toISOString(),
        });
        res.json(updated);
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

        await store.updateDevice(device.id, { last_synced_at: new Date().toISOString() });

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

    app.get('/api/programmes/:id/propagation', async (req, res) => {
        const prog = await store.getProgramme(req.params.id);
        if (!prog) return res.status(404).end();
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

    // ── Legacy public endpoint (current watch build still hits this) ──────────

    app.get('/api/public/programme/latest', async (_req, res) => {
        const prog = await store.findProgrammeForDate(today());
        prog ? res.json(prog) : res.status(404).json({ error: 'No programme for today' });
    });

    // ── Programme builder API (/api/private) ──────────────────────────────────
    // Bridges the flat CRUD the existing UI uses to the channel-based domain model.
    // All programmes go into a single auto-created default channel.

    const priv = express.Router();

    priv.get('/programmes', async (_req, res) => {
        const ch = await defaultChannel(store);
        res.json(await store.findProgrammesByChannel(ch.id));
    });

    priv.post('/programmes', async (req, res) => {
        const ch  = await defaultChannel(store);
        const now = new Date().toISOString();
        const prog = await store.createProgramme({
            ...req.body,
            channel_id:   ch.id,
            published_at: now,
            updated_at:   now,
            scheduled_date: req.body.scheduled_date || today(),
            blocks:         req.body.blocks || [],
        });
        res.status(201).json(prog);
    });

    priv.get('/programmes/:id', async (req, res) => {
        const prog = await store.getProgramme(req.params.id);
        prog ? res.json(prog) : res.status(404).end();
    });

    priv.put('/programmes/:id', async (req, res) => {
        const prog = await store.getProgramme(req.params.id);
        if (!prog) return res.status(404).end();
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
        const deleted = await store.deleteProgramme(req.params.id);
        deleted ? res.status(204).end() : res.status(404).end();
    });

    app.use('/api/private', priv);

    // ── Static UI + SPA fallback ──────────────────────────────────────────────
    // In production the built UI lives in public/. Unknown paths serve index.html
    // so that client-side routes like /join/:channelId work on hard refresh.

    const publicDir = join(__dirname, 'public');
    app.use(express.static(publicDir));
    app.get('*', (_req, res) => {
        res.sendFile(join(publicDir, 'index.html'));
    });

    return app;
}
