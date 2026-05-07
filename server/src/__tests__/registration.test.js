// spec obligations covered:
//   rule-success.ParticipantFirstSignIn
//   rule-failure.ParticipantFirstSignIn.1  (duplicate google_id → same account returned)
//   rule-entity-creation.ParticipantFirstSignIn.1
//   rule-success.ParticipantRegistersDevice
//   rule-failure.ParticipantRegistersDevice.1  (device_code already registered)
//   rule-entity-creation.ParticipantRegistersDevice.1
//   entity-optional.Device.last_synced_at

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { DomainStore } from '../store/domain.js';

function makeApp() { const s = new DomainStore(); return { store: s, app: createApp(s) }; }

// ── ParticipantFirstSignIn ────────────────────────────────────────────────────

describe('POST /api/auth/test (account creation)', () => {
    it('creates an account on first sign-in', async () => {
        const { app } = makeApp();
        const res = await request(app).post('/api/auth/test').send({ google_id: 'g-001' });
        expect(res.status).toBe(200);
        expect(res.body.id).toBeTruthy();
        expect(res.body.google_id).toBe('g-001');
    });

    it('response includes a session token', async () => {
        const { app } = makeApp();
        const res = await request(app).post('/api/auth/test').send({ google_id: 'g-001t' });
        expect(res.status).toBe(200);
        expect(typeof res.body.token).toBe('string');
        expect(res.body.token.length).toBeGreaterThan(0);
    });

    // rule-entity-creation.ParticipantFirstSignIn.1
    it('account has google_id and created_at', async () => {
        const { app } = makeApp();
        const res = await request(app).post('/api/auth/test').send({ google_id: 'g-002' });
        expect(res.body.google_id).toBe('g-002');
        expect(res.body.created_at).toBeTruthy();
        expect(new Date(res.body.created_at).getTime()).not.toBeNaN();
    });

    // rule-failure.ParticipantFirstSignIn.1 — second sign-in returns same account
    it('returns the same account when google_id is already known', async () => {
        const { app } = makeApp();
        const first  = await request(app).post('/api/auth/test').send({ google_id: 'g-003' });
        const second = await request(app).post('/api/auth/test').send({ google_id: 'g-003' });
        expect(second.status).toBe(200);
        expect(second.body.id).toBe(first.body.id);
    });

    it('different google_ids produce different accounts', async () => {
        const { app } = makeApp();
        const a = await request(app).post('/api/auth/test').send({ google_id: 'g-004' });
        const b = await request(app).post('/api/auth/test').send({ google_id: 'g-005' });
        expect(a.body.id).not.toBe(b.body.id);
    });

    it('returns 400 when google_id is absent', async () => {
        const { app } = makeApp();
        const res = await request(app).post('/api/auth/test').send({});
        expect(res.status).toBe(400);
    });
});

// ── ParticipantRegistersDevice ────────────────────────────────────────────────

describe('POST /api/devices', () => {
    let store, app;

    beforeEach(() => { ({ store, app } = makeApp()); });

    async function createAccount() {
        const res = await request(app)
            .post('/api/auth/test')
            .send({ google_id: `g-${Math.random()}` });
        return res.body; // includes .token
    }

    it('registers a new device to an account', async () => {
        const account = await createAccount();
        const res = await request(app).post('/api/devices')
            .set('Authorization', `Bearer ${account.token}`)
            .send({ device_code: 'WATCH-001' });
        expect(res.status).toBe(201);
        expect(res.body.device_code).toBe('WATCH-001');
        expect(res.body.account_id).toBe(account.id);
    });

    // rule-entity-creation.ParticipantRegistersDevice.1
    it('device has device_code, account_id, and registered_at', async () => {
        const account = await createAccount();
        const res = await request(app).post('/api/devices')
            .set('Authorization', `Bearer ${account.token}`)
            .send({ device_code: 'WATCH-002' });
        expect(res.body.device_code).toBe('WATCH-002');
        expect(res.body.account_id).toBe(account.id);
        expect(res.body.registered_at).toBeTruthy();
        expect(new Date(res.body.registered_at).getTime()).not.toBeNaN();
    });

    // entity-optional.Device.last_synced_at — absent until first sync
    it('device.last_synced_at is absent at registration time', async () => {
        const account = await createAccount();
        const res = await request(app).post('/api/devices')
            .set('Authorization', `Bearer ${account.token}`)
            .send({ device_code: 'WATCH-003' });
        expect(res.body.last_synced_at).toBeUndefined();
    });

    // rule-failure.ParticipantRegistersDevice.1
    it('rejects a device_code that is already registered to the same account', async () => {
        const account = await createAccount();

        await request(app).post('/api/devices')
            .set('Authorization', `Bearer ${account.token}`)
            .send({ device_code: 'WATCH-DUP-SAME' });

        const res = await request(app).post('/api/devices')
            .set('Authorization', `Bearer ${account.token}`)
            .send({ device_code: 'WATCH-DUP-SAME' });
        expect(res.status).toBe(409);
        expect(res.body.error).toBe('device_code already registered');
    });

    it('rejects a device_code that is already registered to a different account', async () => {
        const acc1 = await createAccount();
        const acc2 = await createAccount();

        await request(app).post('/api/devices')
            .set('Authorization', `Bearer ${acc1.token}`)
            .send({ device_code: 'WATCH-DUP-OTHER' });

        const res = await request(app).post('/api/devices')
            .set('Authorization', `Bearer ${acc2.token}`)
            .send({ device_code: 'WATCH-DUP-OTHER' });
        expect(res.status).toBe(409);
        expect(res.body.error).toBe('device_code already registered');
    });

    it('returns 401 when no token is provided', async () => {
        const res = await request(app).post('/api/devices')
            .send({ device_code: 'WATCH-NOAUTH' });
        expect(res.status).toBe(401);
    });

    it('returns 400 when device_code is missing', async () => {
        const account = await createAccount();
        const res = await request(app).post('/api/devices')
            .set('Authorization', `Bearer ${account.token}`)
            .send({});
        expect(res.status).toBe(400);
    });
});

// ── Watch device auth ─────────────────────────────────────────────────────────
// All endpoints the watch calls after registration require a valid Bearer token.
// Missing or wrong tokens must return 401 so the watch knows to re-register.

describe('Watch device auth — GET /api/sync/:device_code', () => {
    let app, watchToken;

    beforeEach(async () => {
        ({ app } = makeApp());
        const account = await request(app).post('/api/auth/test').send({ google_id: 'g-wauth-sync' });
        await request(app).post('/api/devices')
            .set('Authorization', `Bearer ${account.body.token}`)
            .send({ device_code: 'WATCH-AUTH-SYNC' });
        const claim = await request(app).get('/api/devices/WATCH-AUTH-SYNC/token');
        watchToken = claim.body.token;
    });

    it('returns 200 with a valid watch token', async () => {
        const res = await request(app).get('/api/sync/WATCH-AUTH-SYNC')
            .set('Authorization', `Bearer ${watchToken}`);
        expect(res.status).toBe(200);
    });

    it('returns 401 with no Authorization header', async () => {
        const res = await request(app).get('/api/sync/WATCH-AUTH-SYNC');
        expect(res.status).toBe(401);
        expect(res.body.error).toBe('authentication required');
    });

    it('returns 401 with an invalid token', async () => {
        const res = await request(app).get('/api/sync/WATCH-AUTH-SYNC')
            .set('Authorization', 'Bearer not-the-right-token');
        expect(res.status).toBe(401);
        expect(res.body.error).toBe('authentication required');
    });

    it('returns 401 when the device code does not exist', async () => {
        const res = await request(app).get('/api/sync/NONEXISTENT-DEVICE')
            .set('Authorization', `Bearer ${watchToken}`);
        expect(res.status).toBe(401);
        expect(res.body.error).toBe('authentication required');
    });
});

describe('Watch device auth — POST /api/sessions/start', () => {
    let app, watchToken, programmeId;

    beforeEach(async () => {
        ({ app } = makeApp());
        const account = await request(app).post('/api/auth/test').send({ google_id: 'g-wauth-sess' });
        await request(app).post('/api/devices')
            .set('Authorization', `Bearer ${account.body.token}`)
            .send({ device_code: 'WATCH-AUTH-SESS' });
        const claim = await request(app).get('/api/devices/WATCH-AUTH-SESS/token');
        watchToken = claim.body.token;

        const channel = await request(app).post('/api/channels')
            .set('Authorization', `Bearer ${account.body.token}`)
            .send({ instructor_oauth_id: account.body.id, name: 'Test Channel' });
        const prog = await request(app).post(`/api/channels/${channel.body.id}/programmes`)
            .set('Authorization', `Bearer ${account.body.token}`)
            .send({ name: 'Test Session', scheduled_date: new Date().toISOString().slice(0, 10), pace_assumption: 330, blocks: [] });
        programmeId = prog.body.id;
    });

    it('returns 201 with a valid watch token', async () => {
        const res = await request(app).post('/api/sessions/start')
            .set('Authorization', `Bearer ${watchToken}`)
            .send({ device_code: 'WATCH-AUTH-SESS', programme_id: programmeId });
        expect(res.status).toBe(201);
    });

    it('returns 401 with no Authorization header', async () => {
        const res = await request(app).post('/api/sessions/start')
            .send({ device_code: 'WATCH-AUTH-SESS', programme_id: programmeId });
        expect(res.status).toBe(401);
        expect(res.body.error).toBe('authentication required');
    });

    it('returns 401 with an invalid token', async () => {
        const res = await request(app).post('/api/sessions/start')
            .set('Authorization', 'Bearer not-the-right-token')
            .send({ device_code: 'WATCH-AUTH-SESS', programme_id: programmeId });
        expect(res.status).toBe(401);
        expect(res.body.error).toBe('authentication required');
    });

    it('returns 401 when the device code does not exist', async () => {
        const res = await request(app).post('/api/sessions/start')
            .set('Authorization', `Bearer ${watchToken}`)
            .send({ device_code: 'NONEXISTENT-DEVICE', programme_id: programmeId });
        expect(res.status).toBe(401);
        expect(res.body.error).toBe('authentication required');
    });
});
