// spec obligations covered:
//   rule-success.RegisteredDevicePoll
//   rule-failure.RegisteredDevicePoll.1  (expired programmes excluded)
//   rule-success.UnregisteredDevicePoll
//   derived.ProgrammeSyncRecord.is_current

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { DomainStore } from '../store/domain.js';

function makeStore() { return new DomainStore(); }

async function seedRegisteredDevice(store) {
    const account = await store.findOrCreateAccount('google-seed');
    const device  = await store.createDevice({
        device_code:   'SEED-DEVICE',
        account_id:    account.id,
        registered_at: new Date().toISOString(),
    });
    return { account, device };
}

async function seedChannel(store, instructor_oauth_id = 'instructor-1', name = 'Tuesday Runs') {
    return store.createChannel({ instructor_oauth_id, name, created_at: new Date().toISOString() });
}

async function seedProgramme(store, channel_id, overrides = {}) {
    const now   = new Date().toISOString();
    const today = new Date().toISOString().slice(0, 10);
    return store.createProgramme({
        channel_id,
        name:            'Test Session',
        scheduled_date:  today,
        pace_assumption: { seconds_per_km: 330 },
        blocks:          [],
        published_at:    now,
        updated_at:      now,
        ...overrides,
    });
}

// ── rule-success.UnregisteredDevicePoll ───────────────────────────────────────

describe('GET /api/sync/:device_code — unregistered device', () => {
    it('returns 404 with registration_required', async () => {
        const app = createApp(makeStore());
        const res = await request(app).get('/api/sync/UNKNOWN-CODE');
        expect(res.status).toBe(404);
        expect(res.body.error).toBe('registration_required');
    });
});

// ── rule-success.RegisteredDevicePoll ─────────────────────────────────────────

describe('GET /api/sync/:device_code — registered device', () => {
    let store, app;

    beforeEach(() => { store = makeStore(); app = createApp(store); });

    it('returns 200 with programmes array', async () => {
        const { account } = await seedRegisteredDevice(store);
        const channel     = await seedChannel(store);
        await store.createSubscription({ account_id: account.id, channel_id: channel.id });
        await seedProgramme(store, channel.id);

        const res = await request(app).get('/api/sync/SEED-DEVICE');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.programmes)).toBe(true);
    });

    it('includes programmes from all subscribed channels', async () => {
        const { account } = await seedRegisteredDevice(store);
        const ch1 = await seedChannel(store, 'i1', 'Club A');
        const ch2 = await seedChannel(store, 'i2', 'Club B');
        await store.createSubscription({ account_id: account.id, channel_id: ch1.id });
        await store.createSubscription({ account_id: account.id, channel_id: ch2.id });
        await seedProgramme(store, ch1.id, { name: 'Session A' });
        await seedProgramme(store, ch2.id, { name: 'Session B' });

        const res = await request(app).get('/api/sync/SEED-DEVICE');
        expect(res.body.programmes).toHaveLength(2);
        const names = res.body.programmes.map(p => p.name).sort();
        expect(names).toEqual(['Session A', 'Session B']);
    });

    // rule-failure.RegisteredDevicePoll.1 — expired programmes excluded
    it('excludes programmes whose scheduled_date is in the past', async () => {
        const { account } = await seedRegisteredDevice(store);
        const channel     = await seedChannel(store);
        await store.createSubscription({ account_id: account.id, channel_id: channel.id });
        const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
        await seedProgramme(store, channel.id, { scheduled_date: yesterday });

        const res = await request(app).get('/api/sync/SEED-DEVICE');
        expect(res.status).toBe(200);
        expect(res.body.programmes).toHaveLength(0);
    });

    it('includes programmes scheduled for today and future dates', async () => {
        const { account } = await seedRegisteredDevice(store);
        const channel     = await seedChannel(store);
        await store.createSubscription({ account_id: account.id, channel_id: channel.id });
        const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
        await seedProgramme(store, channel.id, { name: 'Today' });
        await seedProgramme(store, channel.id, { name: 'Tomorrow', scheduled_date: tomorrow });

        const res = await request(app).get('/api/sync/SEED-DEVICE');
        expect(res.body.programmes).toHaveLength(2);
    });

    it('does not include programmes from unsubscribed channels', async () => {
        const { account } = await seedRegisteredDevice(store);
        const subscribed   = await seedChannel(store, 'i1', 'My Channel');
        const unsubscribed = await seedChannel(store, 'i2', 'Other Channel');
        await store.createSubscription({ account_id: account.id, channel_id: subscribed.id });
        await seedProgramme(store, subscribed.id,   { name: 'Mine' });
        await seedProgramme(store, unsubscribed.id, { name: 'Not Mine' });

        const res = await request(app).get('/api/sync/SEED-DEVICE');
        expect(res.body.programmes).toHaveLength(1);
        expect(res.body.programmes[0].name).toBe('Mine');
    });

    it('updates device.last_synced_at', async () => {
        await seedRegisteredDevice(store);

        const before = await store.findDeviceByCode('SEED-DEVICE');
        expect(before.last_synced_at).toBeUndefined();

        await request(app).get('/api/sync/SEED-DEVICE');

        const after = await store.findDeviceByCode('SEED-DEVICE');
        expect(after.last_synced_at).toBeTruthy();
    });

    it('creates a ProgrammeSyncRecord on first poll', async () => {
        const { account, device } = await seedRegisteredDevice(store);
        const channel = await seedChannel(store);
        await store.createSubscription({ account_id: account.id, channel_id: channel.id });
        const prog = await seedProgramme(store, channel.id);

        await request(app).get('/api/sync/SEED-DEVICE');

        const record = await store.findSyncRecord(device.id, prog.id);
        expect(record).toBeTruthy();
        expect(record.programme_version).toBe(prog.updated_at);
    });

    it('updates existing ProgrammeSyncRecord on repeat poll', async () => {
        const { account, device } = await seedRegisteredDevice(store);
        const channel = await seedChannel(store);
        await store.createSubscription({ account_id: account.id, channel_id: channel.id });
        const v1   = new Date(Date.now() - 5000).toISOString();
        const prog = await seedProgramme(store, channel.id, { updated_at: v1 });

        await request(app).get('/api/sync/SEED-DEVICE');

        const v2 = new Date().toISOString();
        await store.updateProgramme(prog.id, { updated_at: v2 });

        await request(app).get('/api/sync/SEED-DEVICE');

        const record = await store.findSyncRecord(device.id, prog.id);
        expect(record.programme_version).toBe(v2);
    });

    // derived.ProgrammeSyncRecord.is_current
    it('propagation endpoint marks record is_current when versions match', async () => {
        const { account } = await seedRegisteredDevice(store);
        const channel = await seedChannel(store);
        await store.createSubscription({ account_id: account.id, channel_id: channel.id });
        const prog = await seedProgramme(store, channel.id);

        await request(app).get('/api/sync/SEED-DEVICE');

        const res = await request(app).get(`/api/programmes/${prog.id}/propagation`);
        expect(res.status).toBe(200);
        expect(res.body.sync_records).toHaveLength(1);
        expect(res.body.sync_records[0].is_current).toBe(true);
    });

    it('propagation endpoint marks record not is_current after programme edit', async () => {
        const { account } = await seedRegisteredDevice(store);
        const channel = await seedChannel(store);
        await store.createSubscription({ account_id: account.id, channel_id: channel.id });
        const v1   = new Date(Date.now() - 5000).toISOString();
        const prog = await seedProgramme(store, channel.id, { updated_at: v1 });

        await request(app).get('/api/sync/SEED-DEVICE');

        const v2 = new Date().toISOString();
        await store.updateProgramme(prog.id, { updated_at: v2 });

        const res = await request(app).get(`/api/programmes/${prog.id}/propagation`);
        expect(res.body.sync_records[0].is_current).toBe(false);
    });
});
