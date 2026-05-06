// Tests for admin endpoint access control.
// Covers:
//   - All three endpoints reject requests with no Authorization header (401)
//   - Dev mode (no ADMIN_ACCOUNT_ID): any existing account is admitted; invalid tokens rejected (401/403)
//   - Production mode (ADMIN_ACCOUNT_ID set): only the designated account is admitted (403 for everyone else)
//   - Admin data content: sees all accounts/channels, not just their own

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { DomainStore } from '../store/domain.js';

function makeApp() { const s = new DomainStore(); return { store: s, app: createApp(s) }; }

async function httpCreateAccount(app, googleId) {
    const res = await request(app).post('/api/auth/test').send({ google_id: googleId });
    expect(res.status).toBe(200);
    return res.body; // includes .token
}

// Save / restore ADMIN_ACCOUNT_ID around each describe that needs it.
function withAdminEnv() {
    let saved;
    beforeEach(() => { saved = process.env.ADMIN_ACCOUNT_ID; delete process.env.ADMIN_ACCOUNT_ID; });
    afterEach(() => {
        if (saved !== undefined) process.env.ADMIN_ACCOUNT_ID = saved;
        else delete process.env.ADMIN_ACCOUNT_ID;
    });
}

const ADMIN_ENDPOINTS = ['/api/admin/access', '/api/admin/accounts', '/api/admin/channels'];

// ── No Authorization header ───────────────────────────────────────────────────

describe('Admin endpoints — missing Authorization header', () => {
    let app;
    beforeEach(() => { ({ app } = makeApp()); });

    it.each(ADMIN_ENDPOINTS)('GET %s returns 401', async (path) => {
        const res = await request(app).get(path);
        expect(res.status).toBe(401);
    });
});

// ── Dev mode (ADMIN_ACCOUNT_ID not set) ───────────────────────────────────────

describe('Admin endpoints — dev mode (ADMIN_ACCOUNT_ID unset)', () => {
    let app;
    withAdminEnv();
    beforeEach(() => { ({ app } = makeApp()); });

    it('any existing account with valid token is admitted (200)', async () => {
        const account = await httpCreateAccount(app, 'g-devmode-01');
        const res = await request(app).get('/api/admin/access')
            .set('Authorization', `Bearer ${account.token}`);
        expect(res.status).toBe(200);
        expect(res.body.admin).toBe(true);
    });

    it('an invalid/tampered token is rejected (401)', async () => {
        const res = await request(app).get('/api/admin/access')
            .set('Authorization', 'Bearer not-a-real-token');
        expect(res.status).toBe(401);
    });

    it.each(['/api/admin/accounts', '/api/admin/channels'])(
        'GET %s is also blocked for invalid token (401)',
        async (path) => {
            const res = await request(app).get(path)
                .set('Authorization', 'Bearer invalid-token');
            expect(res.status).toBe(401);
        }
    );
});

// ── Production mode (ADMIN_ACCOUNT_ID set) ────────────────────────────────────

describe('Admin endpoints — production mode (ADMIN_ACCOUNT_ID set)', () => {
    let app, adminAccount, otherAccount;
    withAdminEnv();

    beforeEach(async () => {
        ({ app } = makeApp());
        adminAccount = await httpCreateAccount(app, 'g-prodmode-admin');
        otherAccount = await httpCreateAccount(app, 'g-prodmode-other');
        process.env.ADMIN_ACCOUNT_ID = adminAccount.id;
    });

    it('designated admin account is admitted (200)', async () => {
        const res = await request(app).get('/api/admin/access')
            .set('Authorization', `Bearer ${adminAccount.token}`);
        expect(res.status).toBe(200);
    });

    it('non-admin account is rejected (403)', async () => {
        const res = await request(app).get('/api/admin/access')
            .set('Authorization', `Bearer ${otherAccount.token}`);
        expect(res.status).toBe(403);
    });

    it.each(['/api/admin/accounts', '/api/admin/channels'])(
        'GET %s returns 403 for non-admin',
        async (path) => {
            const res = await request(app).get(path)
                .set('Authorization', `Bearer ${otherAccount.token}`);
            expect(res.status).toBe(403);
        }
    );

    it.each(['/api/admin/accounts', '/api/admin/channels'])(
        'GET %s returns 200 for admin',
        async (path) => {
            const res = await request(app).get(path)
                .set('Authorization', `Bearer ${adminAccount.token}`);
            expect(res.status).toBe(200);
        }
    );
});

// ── Admin data content ────────────────────────────────────────────────────────

describe('Admin data content', () => {
    let app, adminAccount, otherAccount;
    withAdminEnv();

    beforeEach(async () => {
        ({ app } = makeApp());
        adminAccount = await httpCreateAccount(app, 'g-content-admin');
        otherAccount = await httpCreateAccount(app, 'g-content-other');
    });

    function adminGet(path) {
        return request(app).get(path).set('Authorization', `Bearer ${adminAccount.token}`);
    }

    it('/api/admin/accounts includes all accounts, not just the admin', async () => {
        const res = await adminGet('/api/admin/accounts');
        expect(res.status).toBe(200);
        const ids = res.body.map(a => a.id);
        expect(ids).toContain(adminAccount.id);
        expect(ids).toContain(otherAccount.id);
    });

    it('each account entry includes devices, subscriptions, and channels arrays', async () => {
        await request(app).post('/api/devices')
            .set('Authorization', `Bearer ${otherAccount.token}`)
            .send({ device_code: 'WATCH-CONTENT-01' });
        await request(app).post('/api/channels')
            .set('Authorization', `Bearer ${otherAccount.token}`)
            .send({ instructor_oauth_id: otherAccount.id, name: 'Other Channel' });

        const res = await adminGet('/api/admin/accounts');
        const other = res.body.find(a => a.id === otherAccount.id);

        expect(Array.isArray(other.devices)).toBe(true);
        expect(other.devices).toHaveLength(1);
        expect(other.devices[0].device_code).toBe('WATCH-CONTENT-01');

        expect(Array.isArray(other.channels)).toBe(true);
        expect(other.channels).toHaveLength(1);
        expect(other.channels[0].name).toBe('Other Channel');

        // Creating a channel auto-subscribes the instructor
        expect(Array.isArray(other.subscriptions)).toBe(true);
        expect(other.subscriptions.length).toBeGreaterThanOrEqual(1);
    });

    it('/api/admin/channels includes all channels', async () => {
        await request(app).post('/api/channels')
            .set('Authorization', `Bearer ${adminAccount.token}`)
            .send({ instructor_oauth_id: adminAccount.id, name: 'Admin Channel' });
        await request(app).post('/api/channels')
            .set('Authorization', `Bearer ${otherAccount.token}`)
            .send({ instructor_oauth_id: otherAccount.id, name: 'Other Channel' });

        const res = await adminGet('/api/admin/channels');
        expect(res.status).toBe(200);
        const names = res.body.map(c => c.name);
        expect(names).toContain('Admin Channel');
        expect(names).toContain('Other Channel');
    });

    it('each channel entry includes subscribers and programmes arrays', async () => {
        const chRes = await request(app).post('/api/channels')
            .set('Authorization', `Bearer ${adminAccount.token}`)
            .send({ instructor_oauth_id: adminAccount.id, name: 'Shared Channel' });
        const channel = chRes.body;

        await request(app)
            .post(`/api/channels/${channel.id}/subscribe`)
            .set('Authorization', `Bearer ${otherAccount.token}`)
            .send({ account_id: otherAccount.id });

        const res = await adminGet('/api/admin/channels');
        const ch = res.body.find(c => c.id === channel.id);

        expect(Array.isArray(ch.subscribers)).toBe(true);
        const subAccountIds = ch.subscribers.map(s => s.account_id);
        expect(subAccountIds).toContain(adminAccount.id); // auto-subscribed as instructor
        expect(subAccountIds).toContain(otherAccount.id);

        expect(Array.isArray(ch.programmes)).toBe(true);
    });
});
