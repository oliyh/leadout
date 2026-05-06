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

describe('POST /api/auth/google', () => {
    it('creates an account on first sign-in', async () => {
        const { app } = makeApp();
        const res = await request(app).post('/api/auth/google').send({ google_id: 'g-001' });
        expect(res.status).toBe(200);
        expect(res.body.id).toBeTruthy();
        expect(res.body.google_id).toBe('g-001');
    });

    it('response includes a session token', async () => {
        const { app } = makeApp();
        const res = await request(app).post('/api/auth/google').send({ google_id: 'g-001t' });
        expect(res.status).toBe(200);
        expect(typeof res.body.token).toBe('string');
        expect(res.body.token.length).toBeGreaterThan(0);
    });

    // rule-entity-creation.ParticipantFirstSignIn.1
    it('account has google_id and created_at', async () => {
        const { app } = makeApp();
        const res = await request(app).post('/api/auth/google').send({ google_id: 'g-002' });
        expect(res.body.google_id).toBe('g-002');
        expect(res.body.created_at).toBeTruthy();
        expect(new Date(res.body.created_at).getTime()).not.toBeNaN();
    });

    // rule-failure.ParticipantFirstSignIn.1 — second sign-in returns same account
    it('returns the same account when google_id is already known', async () => {
        const { app } = makeApp();
        const first  = await request(app).post('/api/auth/google').send({ google_id: 'g-003' });
        const second = await request(app).post('/api/auth/google').send({ google_id: 'g-003' });
        expect(second.status).toBe(200);
        expect(second.body.id).toBe(first.body.id);
    });

    it('different google_ids produce different accounts', async () => {
        const { app } = makeApp();
        const a = await request(app).post('/api/auth/google').send({ google_id: 'g-004' });
        const b = await request(app).post('/api/auth/google').send({ google_id: 'g-005' });
        expect(a.body.id).not.toBe(b.body.id);
    });

    it('returns 400 when google_id is absent', async () => {
        const { app } = makeApp();
        const res = await request(app).post('/api/auth/google').send({});
        expect(res.status).toBe(400);
    });
});

// ── ParticipantRegistersDevice ────────────────────────────────────────────────

describe('POST /api/devices', () => {
    let store, app;

    beforeEach(() => { ({ store, app } = makeApp()); });

    async function createAccount() {
        const res = await request(app)
            .post('/api/auth/google')
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
    it('rejects a device_code that is already registered to any account', async () => {
        const acc1 = await createAccount();
        const acc2 = await createAccount();

        await request(app).post('/api/devices')
            .set('Authorization', `Bearer ${acc1.token}`)
            .send({ device_code: 'WATCH-DUP' });

        const res = await request(app).post('/api/devices')
            .set('Authorization', `Bearer ${acc2.token}`)
            .send({ device_code: 'WATCH-DUP' });
        expect(res.status).toBe(409);
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
