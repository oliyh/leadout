// Acceptance tests — end-to-end flows through the HTTP layer.
// Each flow uses the DomainStore (in-memory) and supertest only; no direct
// store calls. Setup goes through the same endpoints a real client would call.
//
// spec obligations covered:
//   flow.RegistrationFlow            (device code → registered → sync 200)
//   flow.ChannelProgrammeFlow        (create channel, publish programme, CRUD)
//   flow.SubscriptionSyncFlow        (subscribe, sync delivers programme, unsubscribe)
//   flow.ParticipationFlow           (LAP press → participation recorded, idempotent retry)
//   contract.SyncResponse200         (response shape validated against spec/contract.js)
//   contract.ProgrammeShape          (programme fields validated against spec/contract.js)
//   contract.Participation201        (participation response validated against spec/contract.js)

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { DomainStore } from '../store/domain.js';
import {
    assertSyncResponse200,
    assertSyncResponse404,
    assertProgrammeShape,
    assertBlockShape,
    assertSegmentShape,
    assertParticipation201,
    PROGRAMME_FIXTURE,
} from '../../../spec/contract.js';

function makeApp() { const s = new DomainStore(); return { store: s, app: createApp(s) }; }

function today() { return new Date().toISOString().slice(0, 10); }
function tomorrow() { return new Date(Date.now() + 86_400_000).toISOString().slice(0, 10); }

// ── HTTP helpers ──────────────────────────────────────────────────────────────

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

async function httpCreateChannel(app, name, instructorId = 'instructor-1') {
    const res = await request(app).post('/api/channels').send({ instructor_oauth_id: instructorId, name });
    expect(res.status).toBe(201);
    return res.body;
}

async function httpSubscribe(app, channelId, accountId) {
    const res = await request(app).post(`/api/channels/${channelId}/subscribe`).send({ account_id: accountId });
    expect(res.status).toBe(201);
    return res.body;
}

async function httpCreateProgramme(app, channelId, fields = {}) {
    const res = await request(app).post(`/api/channels/${channelId}/programmes`).send({
        name:            'Test Session',
        scheduled_date:  today(),
        pace_assumption: 330,
        blocks:          [],
        ...fields,
    });
    expect(res.status).toBe(201);
    return res.body;
}

async function httpSync(app, deviceCode, model = null) {
    const url = model
        ? `/api/sync/${deviceCode}?model=${encodeURIComponent(model)}`
        : `/api/sync/${deviceCode}`;
    return request(app).get(url);
}

async function httpRecordParticipation(app, deviceCode, programmeId) {
    return request(app).post('/api/sessions/start').send({ device_code: deviceCode, programme_id: programmeId });
}

// ── Registration flow ─────────────────────────────────────────────────────────
// An unknown device code returns 404. After the user registers via the web UI
// (POST /api/auth/google then POST /api/devices), the same device code gets 200.

describe('Registration flow', () => {
    let app;

    beforeEach(() => { ({ app } = makeApp()); });

    it('unknown device returns 404 with registration_required', async () => {
        const res = await httpSync(app, 'UNREGISTERED-001');
        expect(res.status).toBe(404);
        assertSyncResponse404(res.body);
    });

    it('after registration, sync returns 200 with empty programmes', async () => {
        const account = await httpCreateAccount(app, 'g-reg-001');
        await httpRegisterDevice(app, account.id, 'WATCH-REG-01');

        const res = await httpSync(app, 'WATCH-REG-01');
        expect(res.status).toBe(200);
        assertSyncResponse200(res.body);
        expect(res.body.programmes).toHaveLength(0);
        expect(res.body.subscription_count).toBe(0);
    });

    it('sync records the device model name', async () => {
        const account = await httpCreateAccount(app, 'g-reg-002');
        await httpRegisterDevice(app, account.id, 'WATCH-REG-02');

        await httpSync(app, 'WATCH-REG-02', 'Forerunner265');

        const devices = await request(app).get(`/api/accounts/${account.id}/devices`);
        const device = devices.body.find(d => d.device_code === 'WATCH-REG-02');
        expect(device.model_name).toBe('Forerunner265');
    });

    it('sync sets last_synced_at on the device', async () => {
        const account = await httpCreateAccount(app, 'g-reg-003');
        await httpRegisterDevice(app, account.id, 'WATCH-REG-03');

        const before = (await request(app).get(`/api/accounts/${account.id}/devices`)).body[0];
        expect(before.last_synced_at).toBeUndefined();

        await httpSync(app, 'WATCH-REG-03');

        const after = (await request(app).get(`/api/accounts/${account.id}/devices`)).body[0];
        expect(after.last_synced_at).toBeTruthy();
    });

    it('registered device appears in account device list', async () => {
        const account = await httpCreateAccount(app, 'g-reg-004');
        await httpRegisterDevice(app, account.id, 'WATCH-REG-04');

        const res = await request(app).get(`/api/accounts/${account.id}/devices`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].device_code).toBe('WATCH-REG-04');
    });
});

// ── Channel and programme flow ────────────────────────────────────────────────
// Instructor creates a channel, publishes a programme with full structure,
// views participation/sync counts, and can edit while the programme is current.

describe('Channel and programme flow', () => {
    let app;

    beforeEach(() => { ({ app } = makeApp()); });

    it('creates a channel and a programme with blocks and segments', async () => {
        const channel = await httpCreateChannel(app, 'Tuesday Runs');

        const prog = await httpCreateProgramme(app, channel.id, {
            name:   'Tuesday Intervals',
            blocks: PROGRAMME_FIXTURE.blocks,
        });

        expect(prog.id).toBeTruthy();
        expect(prog.name).toBe('Tuesday Intervals');
        expect(prog.blocks).toHaveLength(2);
        expect(prog.blocks[0].segments).toHaveLength(1);
        expect(prog.blocks[1].segments).toHaveLength(2);
    });

    it('programme list shows participation_count and sync_count as 0 before any activity', async () => {
        const channel = await httpCreateChannel(app, 'Morning Group');
        await httpCreateProgramme(app, channel.id);

        const res = await request(app).get(`/api/channels/${channel.id}/programmes`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].participation_count).toBe(0);
        expect(res.body[0].sync_count).toBe(0);
    });

    it('programme response matches contract shape (all watch-required fields present)', async () => {
        const channel = await httpCreateChannel(app, 'Shape Check');
        await httpCreateProgramme(app, channel.id, {
            name:   PROGRAMME_FIXTURE.name,
            blocks: PROGRAMME_FIXTURE.blocks,
        });

        const account = await httpCreateAccount(app, 'g-shape-01');
        await httpRegisterDevice(app, account.id, 'WATCH-SHAPE-01');
        await httpSubscribe(app, channel.id, account.id);

        const syncRes = await httpSync(app, 'WATCH-SHAPE-01');
        expect(syncRes.status).toBe(200);

        const p = syncRes.body.programmes[0];
        assertProgrammeShape(p);

        for (const block of p.blocks) {
            assertBlockShape(block);
            for (const seg of block.segments) {
                assertSegmentShape(seg);
            }
        }
    });

    it('can update a current programme', async () => {
        const channel = await httpCreateChannel(app, 'Update Test');
        const prog = await httpCreateProgramme(app, channel.id, { name: 'Old Name' });

        const res = await request(app).put(`/api/programmes/${prog.id}`).send({ name: 'New Name' });
        expect(res.status).toBe(200);
        expect(res.body.name).toBe('New Name');
    });

    it('rejects updating an expired programme', async () => {
        const channel = await httpCreateChannel(app, 'Expired Test');
        const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
        const prog = await httpCreateProgramme(app, channel.id, { scheduled_date: yesterday });

        const res = await request(app).put(`/api/programmes/${prog.id}`).send({ name: 'Too Late' });
        expect(res.status).toBe(409);
    });

    it('propagation shows is_current: false after programme edit', async () => {
        const channel = await httpCreateChannel(app, 'Propagation Test');
        const programme = await httpCreateProgramme(app, channel.id);
        const account = await httpCreateAccount(app, 'g-prop-01');
        await httpRegisterDevice(app, account.id, 'WATCH-PROP-01');
        await httpSubscribe(app, channel.id, account.id);

        await httpSync(app, 'WATCH-PROP-01');

        await request(app).put(`/api/programmes/${programme.id}`).send({ name: 'Updated' });

        const res = await request(app).get(`/api/programmes/${programme.id}/propagation`);
        expect(res.body.sync_records[0].is_current).toBe(false);
    });
});

// ── Subscription and sync flow ────────────────────────────────────────────────
// Device syncs empty, subscribes to a channel, programme appears in next sync.
// After unsubscribing, programme no longer appears.

describe('Subscription and sync flow', () => {
    let app;

    beforeEach(() => { ({ app } = makeApp()); });

    it("sync delivers today's programme after subscribing", async () => {
        const account = await httpCreateAccount(app, 'g-sub-01');
        await httpRegisterDevice(app, account.id, 'WATCH-SUB-01');
        const channel = await httpCreateChannel(app, 'My Channel');
        await httpSubscribe(app, channel.id, account.id);
        await httpCreateProgramme(app, channel.id, { name: 'Morning Run' });

        const res = await httpSync(app, 'WATCH-SUB-01');
        expect(res.status).toBe(200);
        assertSyncResponse200(res.body);
        expect(res.body.subscription_count).toBe(1);
        expect(res.body.programmes).toHaveLength(1);
        expect(res.body.programmes[0].name).toBe('Morning Run');
    });

    it('sync includes programmes from all subscribed channels', async () => {
        const account = await httpCreateAccount(app, 'g-sub-02');
        await httpRegisterDevice(app, account.id, 'WATCH-SUB-02');
        const ch1 = await httpCreateChannel(app, 'Channel A', 'i1');
        const ch2 = await httpCreateChannel(app, 'Channel B', 'i2');
        await httpSubscribe(app, ch1.id, account.id);
        await httpSubscribe(app, ch2.id, account.id);
        await httpCreateProgramme(app, ch1.id, { name: 'Session A' });
        await httpCreateProgramme(app, ch2.id, { name: 'Session B' });

        const res = await httpSync(app, 'WATCH-SUB-02');
        expect(res.body.programmes).toHaveLength(2);
        expect(res.body.subscription_count).toBe(2);
    });

    it("sync includes tomorrow's programme (server sends all upcoming; watch filters to today)", async () => {
        const account = await httpCreateAccount(app, 'g-sub-03');
        await httpRegisterDevice(app, account.id, 'WATCH-SUB-03');
        const channel = await httpCreateChannel(app, 'Future Channel');
        await httpSubscribe(app, channel.id, account.id);
        await httpCreateProgramme(app, channel.id, { name: 'Today',    scheduled_date: today() });
        await httpCreateProgramme(app, channel.id, { name: 'Tomorrow', scheduled_date: tomorrow() });

        const res = await httpSync(app, 'WATCH-SUB-03');
        expect(res.body.programmes).toHaveLength(2);
        const names = res.body.programmes.map(p => p.name).sort();
        expect(names).toEqual(['Today', 'Tomorrow']);
    });

    it('sync excludes programmes from channels the device is not subscribed to', async () => {
        const account = await httpCreateAccount(app, 'g-sub-04');
        await httpRegisterDevice(app, account.id, 'WATCH-SUB-04');
        const subChannel   = await httpCreateChannel(app, 'Subscribed',   'i1');
        const unsubChannel = await httpCreateChannel(app, 'Unsubscribed', 'i2');
        await httpSubscribe(app, subChannel.id, account.id);
        await httpCreateProgramme(app, subChannel.id,   { name: 'Mine'    });
        await httpCreateProgramme(app, unsubChannel.id, { name: 'Not Mine' });

        const res = await httpSync(app, 'WATCH-SUB-04');
        expect(res.body.programmes).toHaveLength(1);
        expect(res.body.programmes[0].name).toBe('Mine');
    });

    it('after unsubscribing, sync returns empty programmes and subscription_count 0', async () => {
        const account = await httpCreateAccount(app, 'g-sub-05');
        await httpRegisterDevice(app, account.id, 'WATCH-SUB-05');
        const channel = await httpCreateChannel(app, 'Leaving Channel');
        await httpSubscribe(app, channel.id, account.id);
        await httpCreateProgramme(app, channel.id);

        const before = await httpSync(app, 'WATCH-SUB-05');
        expect(before.body.programmes).toHaveLength(1);

        await request(app).delete(`/api/channels/${channel.id}/subscribe`).send({ account_id: account.id });

        const after = await httpSync(app, 'WATCH-SUB-05');
        expect(after.body.programmes).toHaveLength(0);
        expect(after.body.subscription_count).toBe(0);
    });
});

// ── Participation flow ────────────────────────────────────────────────────────
// When a participant presses LAP at session start, the watch POSTs to
// /api/sessions/start. The server records it and updates participation_count on
// the programme. Duplicate posts (retry logic) are idempotent.

describe('Participation flow', () => {
    let app, account, channel, programme;

    beforeEach(async () => {
        ({ app } = makeApp());
        account   = await httpCreateAccount(app, 'g-part-01');
        await httpRegisterDevice(app, account.id, 'WATCH-PART-01');
        channel   = await httpCreateChannel(app, 'Participation Channel');
        await httpSubscribe(app, channel.id, account.id);
        programme = await httpCreateProgramme(app, channel.id, { name: 'Interval Session' });
        await httpSync(app, 'WATCH-PART-01');
    });

    it('records participation and returns 201 with correct shape', async () => {
        const res = await httpRecordParticipation(app, 'WATCH-PART-01', programme.id);
        expect(res.status).toBe(201);
        assertParticipation201(res.body);
        expect(res.body.programme_id).toBe(programme.id);
    });

    it('participation increments programme participation_count to 1', async () => {
        await httpRecordParticipation(app, 'WATCH-PART-01', programme.id);

        const res = await request(app).get(`/api/channels/${channel.id}/programmes`);
        expect(res.body[0].participation_count).toBe(1);
    });

    it('duplicate participation post is idempotent — same record returned, count stays 1', async () => {
        const first  = await httpRecordParticipation(app, 'WATCH-PART-01', programme.id);
        const second = await httpRecordParticipation(app, 'WATCH-PART-01', programme.id);

        expect(first.status).toBe(201);
        expect(second.status).toBe(201);
        expect(second.body.id).toBe(first.body.id);

        const progList = await request(app).get(`/api/channels/${channel.id}/programmes`);
        expect(progList.body[0].participation_count).toBe(1);
    });

    it('two different devices produce two distinct participations', async () => {
        const account2 = await httpCreateAccount(app, 'g-part-02');
        await httpRegisterDevice(app, account2.id, 'WATCH-PART-02');
        await request(app).post(`/api/channels/${channel.id}/subscribe`).send({ account_id: account2.id });
        await httpSync(app, 'WATCH-PART-02');

        await httpRecordParticipation(app, 'WATCH-PART-01', programme.id);
        await httpRecordParticipation(app, 'WATCH-PART-02', programme.id);

        const progList = await request(app).get(`/api/channels/${channel.id}/programmes`);
        expect(progList.body[0].participation_count).toBe(2);
    });

    it('returns 404 when device_code is not registered', async () => {
        const res = await httpRecordParticipation(app, 'GHOST-DEVICE', programme.id);
        expect(res.status).toBe(404);
    });

    it('returns 404 when programme_id is unknown', async () => {
        const res = await httpRecordParticipation(app, 'WATCH-PART-01', 'nonexistent-prog');
        expect(res.status).toBe(404);
    });

    it('returns 400 when required fields are absent', async () => {
        const res = await request(app).post('/api/sessions/start').send({ device_code: 'WATCH-PART-01' });
        expect(res.status).toBe(400);
    });

    it('sync increments sync_count on the programme after a sync', async () => {
        const progList = await request(app).get(`/api/channels/${channel.id}/programmes`);
        expect(progList.body[0].sync_count).toBe(1);
    });
});
