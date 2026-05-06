// Tests that protected endpoints enforce ownership — account A cannot access
// account B's data. Also tests that unauthenticated requests are rejected.
//
// Two layers of protection are verified:
//   1. Unauthenticated (no Bearer token) → 401
//   2. Authenticated as wrong account (valid token, wrong owner) → 403
//
// Separate from these access-control tests, SQL filtering correctness is also
// checked: when each account queries their own data, only their own records
// are returned.

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { DomainStore } from '../store/domain.js';

function makeApp() { const s = new DomainStore(); return { store: s, app: createApp(s) }; }

function today() { return new Date().toISOString().slice(0, 10); }

async function httpCreateAccount(app, googleId) {
    const res = await request(app).post('/api/auth/test').send({ google_id: googleId });
    expect(res.status).toBe(200);
    return res.body; // has .id and .token
}

async function httpRegisterDevice(app, account, deviceCode) {
    const res = await request(app).post('/api/devices')
        .set('Authorization', `Bearer ${account.token}`)
        .send({ device_code: deviceCode });
    expect(res.status).toBe(201);
    return res.body;
}

async function httpCreateChannel(app, account, name) {
    const res = await request(app).post('/api/channels')
        .set('Authorization', `Bearer ${account.token}`)
        .send({ instructor_oauth_id: account.id, name });
    expect(res.status).toBe(201);
    return res.body;
}

async function httpSubscribe(app, account, channelId) {
    const res = await request(app).post(`/api/channels/${channelId}/subscribe`)
        .set('Authorization', `Bearer ${account.token}`);
    expect(res.status).toBe(201);
    return res.body;
}

async function httpPublishProgramme(app, account, channelId, name) {
    const res = await request(app).post(`/api/channels/${channelId}/programmes`)
        .set('Authorization', `Bearer ${account.token}`)
        .send({ name, scheduled_date: today(), pace_assumption: 330, blocks: [] });
    expect(res.status).toBe(201);
    return res.body;
}

// ── Unauthenticated access ────────────────────────────────────────────────────

describe('Unauthenticated access — no Bearer token', () => {
    let app, account;

    beforeEach(async () => {
        ({ app } = makeApp());
        account = await httpCreateAccount(app, 'g-unauth-account');
    });

    it('GET /api/accounts/devices returns 401', async () => {
        const res = await request(app).get('/api/accounts/devices');
        expect(res.status).toBe(401);
    });

    it('GET /api/accounts/:id/subscriptions returns 401', async () => {
        const res = await request(app).get(`/api/accounts/${account.id}/subscriptions`);
        expect(res.status).toBe(401);
    });

    it('GET /api/accounts/:id/channels returns 401', async () => {
        const res = await request(app).get(`/api/accounts/${account.id}/channels`);
        expect(res.status).toBe(401);
    });

    it('POST /api/devices returns 401', async () => {
        const res = await request(app).post('/api/devices')
            .send({ account_id: account.id, device_code: 'WATCH-NOAUTH' });
        expect(res.status).toBe(401);
    });

    it('POST /api/channels returns 401', async () => {
        const res = await request(app).post('/api/channels')
            .send({ instructor_oauth_id: account.id, name: 'Channel' });
        expect(res.status).toBe(401);
    });
});

// ── Device isolation (IDOR) ───────────────────────────────────────────────────

describe('Device isolation', () => {
    let app, alice, bob, aliceDevice;

    beforeEach(async () => {
        ({ app } = makeApp());
        alice = await httpCreateAccount(app, 'g-iso-device-alice');
        bob   = await httpCreateAccount(app, 'g-iso-device-bob');
        aliceDevice = await httpRegisterDevice(app, alice, 'WATCH-ALICE-01');
        await httpRegisterDevice(app, alice, 'WATCH-ALICE-02');
        await httpRegisterDevice(app, bob,   'WATCH-BOB-01');
    });

    // Access control
    it('unauthenticated request for device list returns 401', async () => {
        const res = await request(app).get('/api/accounts/devices');
        expect(res.status).toBe(401);
    });

    it("Bob cannot delete Alice's device (403)", async () => {
        const res = await request(app).delete(`/api/devices/${aliceDevice.id}`)
            .set('Authorization', `Bearer ${bob.token}`);
        expect(res.status).toBe(403);
    });

    // Data correctness — token determines which devices are returned
    it("Alice's device list contains only her two devices", async () => {
        const res = await request(app).get('/api/accounts/devices')
            .set('Authorization', `Bearer ${alice.token}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(2);
        expect(res.body.every(d => d.account_id === alice.id)).toBe(true);
    });

    it("Bob's device list contains only his device", async () => {
        const res = await request(app).get('/api/accounts/devices')
            .set('Authorization', `Bearer ${bob.token}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].account_id).toBe(bob.id);
    });
});

// ── Subscription isolation (IDOR) ─────────────────────────────────────────────

describe('Subscription isolation', () => {
    let app, alice, bob, chA, chB, chC;

    beforeEach(async () => {
        ({ app } = makeApp());
        alice = await httpCreateAccount(app, 'g-iso-sub-alice');
        bob   = await httpCreateAccount(app, 'g-iso-sub-bob');
        chA = await httpCreateChannel(app, alice, 'Channel A');
        chB = await httpCreateChannel(app, alice, 'Channel B');
        chC = await httpCreateChannel(app, bob,   'Channel C');
        // Channels auto-subscribe instructors; add explicit cross-subs
        await httpSubscribe(app, alice, chB.id).catch(() => {}); // may be dup from auto-sub
        await httpSubscribe(app, bob,   chC.id).catch(() => {}); // may be dup from auto-sub
    });

    it("Bob cannot view Alice's subscriptions (403)", async () => {
        const res = await request(app).get(`/api/accounts/${alice.id}/subscriptions`)
            .set('Authorization', `Bearer ${bob.token}`);
        expect(res.status).toBe(403);
    });

    it('unauthenticated request for subscriptions returns 401', async () => {
        const res = await request(app).get(`/api/accounts/${alice.id}/subscriptions`);
        expect(res.status).toBe(401);
    });

    // Data correctness
    it("Alice's subscriptions contain only her subscriptions", async () => {
        const res = await request(app).get(`/api/accounts/${alice.id}/subscriptions`)
            .set('Authorization', `Bearer ${alice.token}`);
        expect(res.status).toBe(200);
        expect(res.body.every(s => s.account_id === alice.id)).toBe(true);
    });

    it("Bob's subscriptions do not include Alice's channel subscriptions", async () => {
        const res = await request(app).get(`/api/accounts/${bob.id}/subscriptions`)
            .set('Authorization', `Bearer ${bob.token}`);
        const channelIds = res.body.map(s => s.channel_id);
        expect(channelIds).not.toContain(chA.id);
        expect(channelIds).not.toContain(chB.id);
    });
});

// ── Channel (instructor) isolation (IDOR) ─────────────────────────────────────

describe('Channel isolation', () => {
    let app, alice, bob, aliceChannel;

    beforeEach(async () => {
        ({ app } = makeApp());
        alice = await httpCreateAccount(app, 'g-iso-chan-alice');
        bob   = await httpCreateAccount(app, 'g-iso-chan-bob');
        aliceChannel = await httpCreateChannel(app, alice, 'Alice Channel 1');
        await httpCreateChannel(app, alice, 'Alice Channel 2');
        await httpCreateChannel(app, bob,   'Bob Channel');
    });

    it("Bob cannot view Alice's channel list (403)", async () => {
        const res = await request(app).get(`/api/accounts/${alice.id}/channels`)
            .set('Authorization', `Bearer ${bob.token}`);
        expect(res.status).toBe(403);
    });

    it('unauthenticated request for channel list returns 401', async () => {
        const res = await request(app).get(`/api/accounts/${alice.id}/channels`);
        expect(res.status).toBe(401);
    });

    it("Bob cannot update Alice's channel (403)", async () => {
        const res = await request(app).put(`/api/channels/${aliceChannel.id}`)
            .set('Authorization', `Bearer ${bob.token}`)
            .send({ name: 'Hijacked' });
        expect(res.status).toBe(403);
    });

    it("Bob cannot publish a programme to Alice's channel (403)", async () => {
        const res = await request(app).post(`/api/channels/${aliceChannel.id}/programmes`)
            .set('Authorization', `Bearer ${bob.token}`)
            .send({ name: 'Hijack Programme', scheduled_date: today(), pace_assumption: 330, blocks: [] });
        expect(res.status).toBe(403);
    });

    it("Bob cannot view Alice's channel programmes (403)", async () => {
        const res = await request(app).get(`/api/channels/${aliceChannel.id}/programmes`)
            .set('Authorization', `Bearer ${bob.token}`);
        expect(res.status).toBe(403);
    });

    it("Bob cannot view Alice's channel subscribers (403)", async () => {
        const res = await request(app).get(`/api/channels/${aliceChannel.id}/subscribers`)
            .set('Authorization', `Bearer ${bob.token}`);
        expect(res.status).toBe(403);
    });

    // Data correctness
    it("Alice's channel list contains only her channels", async () => {
        const res = await request(app).get(`/api/accounts/${alice.id}/channels`)
            .set('Authorization', `Bearer ${alice.token}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(2);
        expect(res.body.every(c => c.instructor_oauth_id === alice.id)).toBe(true);
    });

    it("Bob's channel list does not include Alice's channels", async () => {
        const res = await request(app).get(`/api/accounts/${bob.id}/channels`)
            .set('Authorization', `Bearer ${bob.token}`);
        const names = res.body.map(c => c.name);
        expect(names).not.toContain('Alice Channel 1');
        expect(names).not.toContain('Alice Channel 2');
    });
});

// ── Programme isolation (IDOR) ────────────────────────────────────────────────

describe('Programme isolation', () => {
    let app, alice, bob, aliceChannel, aliceProg;

    beforeEach(async () => {
        ({ app } = makeApp());
        alice = await httpCreateAccount(app, 'g-iso-prog-alice');
        bob   = await httpCreateAccount(app, 'g-iso-prog-bob');
        aliceChannel = await httpCreateChannel(app, alice, "Alice's Channel");
        aliceProg    = await httpPublishProgramme(app, alice, aliceChannel.id, "Alice's Programme");
    });

    it("Bob cannot edit Alice's programme (403)", async () => {
        const res = await request(app).put(`/api/private/programmes/${aliceProg.id}`)
            .set('Authorization', `Bearer ${bob.token}`)
            .send({ name: 'Hijacked' });
        expect(res.status).toBe(403);
    });

    it("Bob cannot view propagation stats for Alice's programme (403)", async () => {
        const res = await request(app).get(`/api/programmes/${aliceProg.id}/propagation`)
            .set('Authorization', `Bearer ${bob.token}`);
        expect(res.status).toBe(403);
    });

    it('unauthenticated requests for programme propagation return 401', async () => {
        const res = await request(app).get(`/api/programmes/${aliceProg.id}/propagation`);
        expect(res.status).toBe(401);
    });
});

// ── Sync isolation ────────────────────────────────────────────────────────────

describe('Sync isolation', () => {
    let app, alice, bob, aliceChannel, bobChannel;

    beforeEach(async () => {
        ({ app } = makeApp());
        alice = await httpCreateAccount(app, 'g-iso-sync-alice');
        bob   = await httpCreateAccount(app, 'g-iso-sync-bob');
        aliceChannel = await httpCreateChannel(app, alice, "Alice's Channel");
        bobChannel   = await httpCreateChannel(app, bob,   "Bob's Channel");
        await httpRegisterDevice(app, alice, 'WATCH-ISO-ALICE');
        await httpRegisterDevice(app, bob,   'WATCH-ISO-BOB');
        await httpPublishProgramme(app, alice, aliceChannel.id, "Alice's Programme");
        await httpPublishProgramme(app, bob,   bobChannel.id,   "Bob's Programme");
    });

    it("Alice's sync only includes programmes from channels she's subscribed to", async () => {
        const res = await request(app).get('/api/sync/WATCH-ISO-ALICE');
        expect(res.status).toBe(200);
        const names = res.body.programmes.map(p => p.name);
        expect(names).toContain("Alice's Programme");
        expect(names).not.toContain("Bob's Programme");
    });

    it("Bob's sync only includes programmes from channels he's subscribed to", async () => {
        const res = await request(app).get('/api/sync/WATCH-ISO-BOB');
        expect(res.status).toBe(200);
        const names = res.body.programmes.map(p => p.name);
        expect(names).toContain("Bob's Programme");
        expect(names).not.toContain("Alice's Programme");
    });

    it('subscribing Alice to Bob channel makes his programme appear in her sync', async () => {
        await httpSubscribe(app, alice, bobChannel.id);

        const res = await request(app).get('/api/sync/WATCH-ISO-ALICE');
        const names = res.body.programmes.map(p => p.name);
        expect(names).toContain("Alice's Programme");
        expect(names).toContain("Bob's Programme");
    });
});
