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
// All account objects returned from these helpers have .id and .token.

async function httpCreateAccount(app, googleId) {
    const res = await request(app).post('/api/auth/test').send({ google_id: googleId });
    expect(res.status).toBe(200);
    return res.body;
}

async function httpRegisterDevice(app, account, deviceCode) {
    const res = await request(app).post('/api/devices')
        .set('Authorization', `Bearer ${account.token}`)
        .send({ device_code: deviceCode });
    expect(res.status).toBe(201);
    const claim = await request(app).get(`/api/devices/${deviceCode}/token`);
    expect(claim.status).toBe(200);
    return { ...res.body, watch_token: claim.body.token };
}

async function httpCreateChannel(app, name, instructorAccount) {
    const res = await request(app).post('/api/channels')
        .set('Authorization', `Bearer ${instructorAccount.token}`)
        .send({ instructor_oauth_id: instructorAccount.id, name });
    expect(res.status).toBe(201);
    return res.body;
}

async function httpSubscribe(app, channelId, account) {
    const res = await request(app).post(`/api/channels/${channelId}/subscribe`)
        .set('Authorization', `Bearer ${account.token}`);
    expect(res.status).toBe(201);
    return res.body;
}

async function httpCreateProgramme(app, channelId, instructorAccount, fields = {}) {
    const res = await request(app).post(`/api/channels/${channelId}/programmes`)
        .set('Authorization', `Bearer ${instructorAccount.token}`)
        .send({
            name:            'Test Session',
            scheduled_date:  today(),
            pace_assumption: 330,
            blocks:          [],
            ...fields,
        });
    expect(res.status).toBe(201);
    return res.body;
}

async function httpSync(app, deviceCode, watchToken, model = null) {
    const url = model
        ? `/api/sync/${deviceCode}?model=${encodeURIComponent(model)}`
        : `/api/sync/${deviceCode}`;
    return request(app).get(url).set('Authorization', `Bearer ${watchToken}`);
}

async function httpRecordParticipation(app, deviceCode, programmeId, watchToken) {
    return request(app).post('/api/sessions/start')
        .set('Authorization', `Bearer ${watchToken}`)
        .send({ device_code: deviceCode, programme_id: programmeId });
}

// ── Registration flow ─────────────────────────────────────────────────────────

describe('Registration flow', () => {
    let app;

    beforeEach(() => { ({ app } = makeApp()); });

    it('unknown device returns 401 when no token supplied', async () => {
        const res = await request(app).get('/api/sync/UNREGISTERED-001');
        expect(res.status).toBe(401);
        expect(res.body.error).toBe('authentication required');
    });

    it('after registration, sync returns 200 with empty programmes', async () => {
        const account = await httpCreateAccount(app, 'g-reg-001');
        const { watch_token } = await httpRegisterDevice(app, account, 'WATCH-REG-01');

        const res = await httpSync(app, 'WATCH-REG-01', watch_token);
        expect(res.status).toBe(200);
        assertSyncResponse200(res.body);
        expect(res.body.programmes).toHaveLength(0);
        expect(res.body.subscription_count).toBe(0);
    });

    it('sync records the device model name', async () => {
        const account = await httpCreateAccount(app, 'g-reg-002');
        const { watch_token } = await httpRegisterDevice(app, account, 'WATCH-REG-02');

        await httpSync(app, 'WATCH-REG-02', watch_token, 'Forerunner265');

        const devices = await request(app).get('/api/accounts/devices')
            .set('Authorization', `Bearer ${account.token}`);
        const device = devices.body.find(d => d.device_code === 'WATCH-REG-02');
        expect(device.model_name).toBe('Forerunner265');
    });

    it('sync sets last_synced_at on the device', async () => {
        const account = await httpCreateAccount(app, 'g-reg-003');
        const { watch_token } = await httpRegisterDevice(app, account, 'WATCH-REG-03');

        const before = (await request(app).get('/api/accounts/devices')
            .set('Authorization', `Bearer ${account.token}`)).body[0];
        expect(before.last_synced_at).toBeUndefined();

        await httpSync(app, 'WATCH-REG-03', watch_token);

        const after = (await request(app).get('/api/accounts/devices')
            .set('Authorization', `Bearer ${account.token}`)).body[0];
        expect(after.last_synced_at).toBeTruthy();
    });

    it('registered device appears in account device list', async () => {
        const account = await httpCreateAccount(app, 'g-reg-004');
        await httpRegisterDevice(app, account, 'WATCH-REG-04');

        const res = await request(app).get('/api/accounts/devices')
            .set('Authorization', `Bearer ${account.token}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].device_code).toBe('WATCH-REG-04');
    });
});

// ── Channel and programme flow ────────────────────────────────────────────────

describe('Channel and programme flow', () => {
    let app, instructor;

    beforeEach(async () => {
        ({ app } = makeApp());
        instructor = await httpCreateAccount(app, 'g-chan-instructor');
    });

    it('creates a channel and a programme with blocks and segments', async () => {
        const channel = await httpCreateChannel(app, 'Tuesday Runs', instructor);

        const prog = await httpCreateProgramme(app, channel.id, instructor, {
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
        const channel = await httpCreateChannel(app, 'Morning Group', instructor);
        await httpCreateProgramme(app, channel.id, instructor);

        const res = await request(app).get(`/api/channels/${channel.id}/programmes`)
            .set('Authorization', `Bearer ${instructor.token}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].participation_count).toBe(0);
        expect(res.body[0].sync_count).toBe(0);
    });

    it('programme response matches contract shape (all watch-required fields present)', async () => {
        const channel = await httpCreateChannel(app, 'Shape Check', instructor);
        await httpCreateProgramme(app, channel.id, instructor, {
            name:   PROGRAMME_FIXTURE.name,
            blocks: PROGRAMME_FIXTURE.blocks,
        });

        const account = await httpCreateAccount(app, 'g-shape-01');
        const { watch_token } = await httpRegisterDevice(app, account, 'WATCH-SHAPE-01');
        await httpSubscribe(app, channel.id, account);

        const syncRes = await httpSync(app, 'WATCH-SHAPE-01', watch_token);
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
        const channel = await httpCreateChannel(app, 'Update Test', instructor);
        const prog = await httpCreateProgramme(app, channel.id, instructor, { name: 'Old Name' });

        const res = await request(app).put(`/api/private/programmes/${prog.id}`)
            .set('Authorization', `Bearer ${instructor.token}`)
            .send({ name: 'New Name' });
        expect(res.status).toBe(200);
        expect(res.body.name).toBe('New Name');
    });

    it('rejects updating an expired programme', async () => {
        const channel = await httpCreateChannel(app, 'Expired Test', instructor);
        const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
        const prog = await httpCreateProgramme(app, channel.id, instructor, { scheduled_date: yesterday });

        const res = await request(app).put(`/api/private/programmes/${prog.id}`)
            .set('Authorization', `Bearer ${instructor.token}`)
            .send({ name: 'Too Late' });
        expect(res.status).toBe(409);
    });

    it('propagation shows is_current: false after programme edit', async () => {
        const channel = await httpCreateChannel(app, 'Propagation Test', instructor);
        const programme = await httpCreateProgramme(app, channel.id, instructor);
        const account = await httpCreateAccount(app, 'g-prop-01');
        const { watch_token } = await httpRegisterDevice(app, account, 'WATCH-PROP-01');
        await httpSubscribe(app, channel.id, account);

        await httpSync(app, 'WATCH-PROP-01', watch_token);

        await request(app).put(`/api/private/programmes/${programme.id}`)
            .set('Authorization', `Bearer ${instructor.token}`)
            .send({ name: 'Updated' });

        const res = await request(app).get(`/api/programmes/${programme.id}/propagation`)
            .set('Authorization', `Bearer ${instructor.token}`);
        expect(res.body.sync_records[0].is_current).toBe(false);
    });
});

// ── Subscription and sync flow ────────────────────────────────────────────────

describe('Subscription and sync flow', () => {
    let app;

    beforeEach(() => { ({ app } = makeApp()); });

    it("sync delivers today's programme after subscribing", async () => {
        const account    = await httpCreateAccount(app, 'g-sub-01');
        const instructor = await httpCreateAccount(app, 'g-sub-instr-01');
        const { watch_token } = await httpRegisterDevice(app, account, 'WATCH-SUB-01');
        const channel = await httpCreateChannel(app, 'My Channel', instructor);
        await httpSubscribe(app, channel.id, account);
        await httpCreateProgramme(app, channel.id, instructor, { name: 'Morning Run' });

        const res = await httpSync(app, 'WATCH-SUB-01', watch_token);
        expect(res.status).toBe(200);
        assertSyncResponse200(res.body);
        expect(res.body.subscription_count).toBe(1);
        expect(res.body.programmes).toHaveLength(1);
        expect(res.body.programmes[0].name).toBe('Morning Run');
    });

    it('sync includes programmes from all subscribed channels', async () => {
        const account    = await httpCreateAccount(app, 'g-sub-02');
        const instructor = await httpCreateAccount(app, 'g-sub-instr-02');
        const { watch_token } = await httpRegisterDevice(app, account, 'WATCH-SUB-02');
        const ch1 = await httpCreateChannel(app, 'Channel A', instructor);
        const ch2 = await httpCreateChannel(app, 'Channel B', instructor);
        await httpSubscribe(app, ch1.id, account);
        await httpSubscribe(app, ch2.id, account);
        await httpCreateProgramme(app, ch1.id, instructor, { name: 'Session A' });
        await httpCreateProgramme(app, ch2.id, instructor, { name: 'Session B' });

        const res = await httpSync(app, 'WATCH-SUB-02', watch_token);
        expect(res.body.programmes).toHaveLength(2);
        expect(res.body.subscription_count).toBe(2);
    });

    it("sync includes tomorrow's programme (server sends all upcoming; watch filters to today)", async () => {
        const account    = await httpCreateAccount(app, 'g-sub-03');
        const instructor = await httpCreateAccount(app, 'g-sub-instr-03');
        const { watch_token } = await httpRegisterDevice(app, account, 'WATCH-SUB-03');
        const channel = await httpCreateChannel(app, 'Future Channel', instructor);
        await httpSubscribe(app, channel.id, account);
        await httpCreateProgramme(app, channel.id, instructor, { name: 'Today',    scheduled_date: today() });
        await httpCreateProgramme(app, channel.id, instructor, { name: 'Tomorrow', scheduled_date: tomorrow() });

        const res = await httpSync(app, 'WATCH-SUB-03', watch_token);
        expect(res.body.programmes).toHaveLength(2);
        const names = res.body.programmes.map(p => p.name).sort();
        expect(names).toEqual(['Today', 'Tomorrow']);
    });

    it('sync excludes programmes from channels the device is not subscribed to', async () => {
        const account    = await httpCreateAccount(app, 'g-sub-04');
        const i1         = await httpCreateAccount(app, 'g-sub-instr-04a');
        const i2         = await httpCreateAccount(app, 'g-sub-instr-04b');
        const { watch_token } = await httpRegisterDevice(app, account, 'WATCH-SUB-04');
        const subChannel   = await httpCreateChannel(app, 'Subscribed',   i1);
        const unsubChannel = await httpCreateChannel(app, 'Unsubscribed', i2);
        await httpSubscribe(app, subChannel.id, account);
        await httpCreateProgramme(app, subChannel.id,   i1, { name: 'Mine'    });
        await httpCreateProgramme(app, unsubChannel.id, i2, { name: 'Not Mine' });

        const res = await httpSync(app, 'WATCH-SUB-04', watch_token);
        expect(res.body.programmes).toHaveLength(1);
        expect(res.body.programmes[0].name).toBe('Mine');
    });

    it('after unsubscribing, sync returns empty programmes and subscription_count 0', async () => {
        const account    = await httpCreateAccount(app, 'g-sub-05');
        const instructor = await httpCreateAccount(app, 'g-sub-instr-05');
        const { watch_token } = await httpRegisterDevice(app, account, 'WATCH-SUB-05');
        const channel = await httpCreateChannel(app, 'Leaving Channel', instructor);
        await httpSubscribe(app, channel.id, account);
        await httpCreateProgramme(app, channel.id, instructor);

        const before = await httpSync(app, 'WATCH-SUB-05', watch_token);
        expect(before.body.programmes).toHaveLength(1);

        await request(app).delete(`/api/channels/${channel.id}/subscribe`)
            .set('Authorization', `Bearer ${account.token}`);

        const after = await httpSync(app, 'WATCH-SUB-05', watch_token);
        expect(after.body.programmes).toHaveLength(0);
        expect(after.body.subscription_count).toBe(0);
    });
});

// ── Participation flow ────────────────────────────────────────────────────────

describe('Participation flow', () => {
    let app, account, instructor, channel, programme, watchToken;

    beforeEach(async () => {
        ({ app } = makeApp());
        account    = await httpCreateAccount(app, 'g-part-01');
        instructor = await httpCreateAccount(app, 'g-part-instr-01');
        ({ watch_token: watchToken } = await httpRegisterDevice(app, account, 'WATCH-PART-01'));
        channel   = await httpCreateChannel(app, 'Participation Channel', instructor);
        await httpSubscribe(app, channel.id, account);
        programme = await httpCreateProgramme(app, channel.id, instructor, { name: 'Interval Session' });
        await httpSync(app, 'WATCH-PART-01', watchToken);
    });

    it('records participation and returns 201 with correct shape', async () => {
        const res = await httpRecordParticipation(app, 'WATCH-PART-01', programme.id, watchToken);
        expect(res.status).toBe(201);
        assertParticipation201(res.body);
        expect(res.body.programme_id).toBe(programme.id);
    });

    it('participation increments programme participation_count to 1', async () => {
        await httpRecordParticipation(app, 'WATCH-PART-01', programme.id, watchToken);

        const res = await request(app).get(`/api/channels/${channel.id}/programmes`)
            .set('Authorization', `Bearer ${instructor.token}`);
        expect(res.body[0].participation_count).toBe(1);
    });

    it('duplicate participation post is idempotent — same record returned, count stays 1', async () => {
        const first  = await httpRecordParticipation(app, 'WATCH-PART-01', programme.id, watchToken);
        const second = await httpRecordParticipation(app, 'WATCH-PART-01', programme.id, watchToken);

        expect(first.status).toBe(201);
        expect(second.status).toBe(201);
        expect(second.body.id).toBe(first.body.id);

        const progList = await request(app).get(`/api/channels/${channel.id}/programmes`)
            .set('Authorization', `Bearer ${instructor.token}`);
        expect(progList.body[0].participation_count).toBe(1);
    });

    it('two different devices produce two distinct participations', async () => {
        const account2 = await httpCreateAccount(app, 'g-part-02');
        const { watch_token: watchToken2 } = await httpRegisterDevice(app, account2, 'WATCH-PART-02');
        await request(app).post(`/api/channels/${channel.id}/subscribe`)
            .set('Authorization', `Bearer ${account2.token}`);
        await httpSync(app, 'WATCH-PART-02', watchToken2);

        await httpRecordParticipation(app, 'WATCH-PART-01', programme.id, watchToken);
        await httpRecordParticipation(app, 'WATCH-PART-02', programme.id, watchToken2);

        const progList = await request(app).get(`/api/channels/${channel.id}/programmes`)
            .set('Authorization', `Bearer ${instructor.token}`);
        expect(progList.body[0].participation_count).toBe(2);
    });

    it('returns 401 when device_code is not registered', async () => {
        const res = await httpRecordParticipation(app, 'GHOST-DEVICE', programme.id, watchToken);
        expect(res.status).toBe(401);
    });

    it('returns 404 when programme_id is unknown', async () => {
        const res = await httpRecordParticipation(app, 'WATCH-PART-01', 'nonexistent-prog', watchToken);
        expect(res.status).toBe(404);
    });

    it('returns 401 when no auth token supplied', async () => {
        const res = await request(app).post('/api/sessions/start')
            .send({ device_code: 'WATCH-PART-01', programme_id: programme.id });
        expect(res.status).toBe(401);
    });

    it('sync increments sync_count on the programme after a sync', async () => {
        const progList = await request(app).get(`/api/channels/${channel.id}/programmes`)
            .set('Authorization', `Bearer ${instructor.token}`);
        expect(progList.body[0].sync_count).toBe(1);
    });
});
