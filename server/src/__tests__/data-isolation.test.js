// Tests that each account's data endpoints only return that account's own data,
// even when multiple accounts exist in the same store.
// Covers devices, subscriptions, channels, channel subscribers, and sync.

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { DomainStore } from '../store/domain.js';

function makeApp() { const s = new DomainStore(); return { store: s, app: createApp(s) }; }

function today() { return new Date().toISOString().slice(0, 10); }

async function httpCreateAccount(app, googleId) {
    const res = await request(app).post('/api/auth/google').send({ google_id: googleId });
    expect(res.status).toBe(200);
    return res.body;
}

async function httpRegisterDevice(app, accountId, deviceCode) {
    const res = await request(app).post('/api/devices').send({ account_id: accountId, device_code: deviceCode });
    expect(res.status).toBe(201);
    return res.body;
}

async function httpCreateChannel(app, name, instructorId) {
    const res = await request(app).post('/api/channels').send({ instructor_oauth_id: instructorId, name });
    expect(res.status).toBe(201);
    return res.body;
}

async function httpSubscribe(app, channelId, accountId) {
    const res = await request(app)
        .post(`/api/channels/${channelId}/subscribe`)
        .send({ account_id: accountId });
    expect(res.status).toBe(201);
    return res.body;
}

async function httpPublishProgramme(app, channelId, name) {
    const res = await request(app).post(`/api/channels/${channelId}/programmes`).send({
        name, scheduled_date: today(), pace_assumption: 330, blocks: [],
    });
    expect(res.status).toBe(201);
    return res.body;
}

// ── Device isolation ──────────────────────────────────────────────────────────

describe('Device isolation', () => {
    let app, alice, bob;

    beforeEach(async () => {
        ({ app } = makeApp());
        alice = await httpCreateAccount(app, 'g-iso-device-alice');
        bob   = await httpCreateAccount(app, 'g-iso-device-bob');
        await httpRegisterDevice(app, alice.id, 'WATCH-ALICE-01');
        await httpRegisterDevice(app, alice.id, 'WATCH-ALICE-02');
        await httpRegisterDevice(app, bob.id,   'WATCH-BOB-01');
    });

    it("Alice's device list contains only her two devices", async () => {
        const res = await request(app).get(`/api/accounts/${alice.id}/devices`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(2);
        expect(res.body.every(d => d.account_id === alice.id)).toBe(true);
    });

    it("Bob's device list contains only his device", async () => {
        const res = await request(app).get(`/api/accounts/${bob.id}/devices`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].account_id).toBe(bob.id);
    });

    it("Alice's devices do not appear in Bob's device list", async () => {
        const res = await request(app).get(`/api/accounts/${bob.id}/devices`);
        const codes = res.body.map(d => d.device_code);
        expect(codes).not.toContain('WATCH-ALICE-01');
        expect(codes).not.toContain('WATCH-ALICE-02');
    });
});

// ── Subscription isolation ────────────────────────────────────────────────────

describe('Subscription isolation', () => {
    let app, alice, bob, chA, chB, chC;

    beforeEach(async () => {
        ({ app } = makeApp());
        alice = await httpCreateAccount(app, 'g-iso-sub-alice');
        bob   = await httpCreateAccount(app, 'g-iso-sub-bob');
        chA = await httpCreateChannel(app, 'Channel A', 'instructor-x');
        chB = await httpCreateChannel(app, 'Channel B', 'instructor-y');
        chC = await httpCreateChannel(app, 'Channel C', 'instructor-z');
        await httpSubscribe(app, chA.id, alice.id);
        await httpSubscribe(app, chB.id, alice.id);
        await httpSubscribe(app, chC.id, bob.id);
    });

    it("Alice's subscriptions contain only her two subscriptions", async () => {
        const res = await request(app).get(`/api/accounts/${alice.id}/subscriptions`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(2);
        expect(res.body.every(s => s.account_id === alice.id)).toBe(true);
    });

    it("Bob's subscriptions contain only his one subscription", async () => {
        const res = await request(app).get(`/api/accounts/${bob.id}/subscriptions`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].account_id).toBe(bob.id);
    });

    it("Alice's channels do not appear in Bob's subscription list", async () => {
        const res = await request(app).get(`/api/accounts/${bob.id}/subscriptions`);
        const channelIds = res.body.map(s => s.channel_id);
        expect(channelIds).not.toContain(chA.id);
        expect(channelIds).not.toContain(chB.id);
    });
});

// ── Channel (instructor) isolation ────────────────────────────────────────────

describe('Channel isolation', () => {
    let app, alice, bob;

    beforeEach(async () => {
        ({ app } = makeApp());
        alice = await httpCreateAccount(app, 'g-iso-chan-alice');
        bob   = await httpCreateAccount(app, 'g-iso-chan-bob');
        await httpCreateChannel(app, 'Alice Channel 1', alice.id);
        await httpCreateChannel(app, 'Alice Channel 2', alice.id);
        await httpCreateChannel(app, 'Bob Channel',     bob.id);
    });

    it("Alice's channel list contains only her two channels", async () => {
        const res = await request(app).get(`/api/accounts/${alice.id}/channels`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(2);
        expect(res.body.every(c => c.instructor_oauth_id === alice.id)).toBe(true);
    });

    it("Bob's channel list contains only his one channel", async () => {
        const res = await request(app).get(`/api/accounts/${bob.id}/channels`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].instructor_oauth_id).toBe(bob.id);
    });

    it("Alice's channels do not appear in Bob's channel list", async () => {
        const res = await request(app).get(`/api/accounts/${bob.id}/channels`);
        const names = res.body.map(c => c.name);
        expect(names).not.toContain('Alice Channel 1');
        expect(names).not.toContain('Alice Channel 2');
    });
});

// ── Channel subscriber isolation ──────────────────────────────────────────────

describe('Channel subscriber isolation', () => {
    let app, alice, bob, aliceChannel, bobChannel;

    beforeEach(async () => {
        ({ app } = makeApp());
        alice = await httpCreateAccount(app, 'g-iso-chsub-alice');
        bob   = await httpCreateAccount(app, 'g-iso-chsub-bob');
        // Each instructor is auto-subscribed to their own channel on creation
        aliceChannel = await httpCreateChannel(app, "Alice's Channel", alice.id);
        bobChannel   = await httpCreateChannel(app, "Bob's Channel",   bob.id);
        // Alice additionally subscribes to Bob's channel
        await httpSubscribe(app, bobChannel.id, alice.id);
    });

    it("Alice's channel shows Alice as subscriber but not Bob", async () => {
        const res = await request(app).get(`/api/channels/${aliceChannel.id}/subscribers`);
        expect(res.status).toBe(200);
        const accountIds = res.body.map(s => s.account_id);
        expect(accountIds).toContain(alice.id);
        expect(accountIds).not.toContain(bob.id);
    });

    it("Bob's channel shows Bob and Alice (Alice subscribed explicitly)", async () => {
        const res = await request(app).get(`/api/channels/${bobChannel.id}/subscribers`);
        expect(res.status).toBe(200);
        const accountIds = res.body.map(s => s.account_id);
        expect(accountIds).toContain(bob.id);
        expect(accountIds).toContain(alice.id);
    });
});

// ── Sync isolation ────────────────────────────────────────────────────────────

describe('Sync isolation', () => {
    let app, alice, bob, aliceChannel, bobChannel;

    beforeEach(async () => {
        ({ app } = makeApp());
        alice = await httpCreateAccount(app, 'g-iso-sync-alice');
        bob   = await httpCreateAccount(app, 'g-iso-sync-bob');
        // Each instructor auto-subscribes to their own channel
        aliceChannel = await httpCreateChannel(app, "Alice's Channel", alice.id);
        bobChannel   = await httpCreateChannel(app, "Bob's Channel",   bob.id);
        await httpRegisterDevice(app, alice.id, 'WATCH-ISO-ALICE');
        await httpRegisterDevice(app, bob.id,   'WATCH-ISO-BOB');
        await httpPublishProgramme(app, aliceChannel.id, "Alice's Programme");
        await httpPublishProgramme(app, bobChannel.id,   "Bob's Programme");
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
        await httpSubscribe(app, bobChannel.id, alice.id);

        const res = await request(app).get('/api/sync/WATCH-ISO-ALICE');
        const names = res.body.programmes.map(p => p.name);
        expect(names).toContain("Alice's Programme");
        expect(names).toContain("Bob's Programme");
    });
});
