// spec obligations covered:
//   rule-success.InstructorCreatesChannel
//   rule-entity-creation.InstructorCreatesChannel.1
//   rule-success.ParticipantSubscribes
//   rule-failure.ParticipantSubscribes.1  (duplicate subscription rejected)
//   rule-entity-creation.ParticipantSubscribes.1

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { DomainStore } from '../store/domain.js';

function makeApp() { const s = new DomainStore(); return { store: s, app: createApp(s) }; }

async function httpCreateAccount(app, googleId) {
    const res = await request(app).post('/api/auth/google').send({ google_id: googleId });
    expect(res.status).toBe(200);
    return res.body; // includes .token
}

// ── InstructorCreatesChannel ──────────────────────────────────────────────────

describe('POST /api/channels', () => {
    it('creates a channel', async () => {
        const { app } = makeApp();
        const instructor = await httpCreateAccount(app, 'g-ch-instr-001');
        const res = await request(app).post('/api/channels')
            .set('Authorization', `Bearer ${instructor.token}`)
            .send({ instructor_oauth_id: instructor.id, name: 'Tuesday Runs with Sarah' });
        expect(res.status).toBe(201);
        expect(res.body.id).toBeTruthy();
        expect(res.body.name).toBe('Tuesday Runs with Sarah');
    });

    // rule-entity-creation.InstructorCreatesChannel.1
    it('channel has instructor_oauth_id, name, and created_at', async () => {
        const { app } = makeApp();
        const instructor = await httpCreateAccount(app, 'g-ch-instr-002');
        const res = await request(app).post('/api/channels')
            .set('Authorization', `Bearer ${instructor.token}`)
            .send({ instructor_oauth_id: instructor.id, name: 'Morning Group' });
        expect(res.body.instructor_oauth_id).toBe(instructor.id);
        expect(res.body.name).toBe('Morning Group');
        expect(res.body.created_at).toBeTruthy();
        expect(new Date(res.body.created_at).getTime()).not.toBeNaN();
    });

    it('returns 401 when no token is provided', async () => {
        const { app } = makeApp();
        const res = await request(app).post('/api/channels')
            .send({ instructor_oauth_id: 'some-id', name: 'No Auth' });
        expect(res.status).toBe(401);
    });

    it('returns 403 when token does not match instructor_oauth_id', async () => {
        const { app } = makeApp();
        const acc1 = await httpCreateAccount(app, 'g-ch-instr-003');
        const acc2 = await httpCreateAccount(app, 'g-ch-instr-004');
        const res = await request(app).post('/api/channels')
            .set('Authorization', `Bearer ${acc1.token}`)
            .send({ instructor_oauth_id: acc2.id, name: 'Mismatch Channel' });
        expect(res.status).toBe(403);
    });

    it('returns 400 when required fields are missing', async () => {
        const { app } = makeApp();
        const instructor = await httpCreateAccount(app, 'g-ch-instr-005');
        const res = await request(app).post('/api/channels')
            .set('Authorization', `Bearer ${instructor.token}`)
            .send({ name: 'No instructor' });
        expect(res.status).toBe(400);
    });
});

// ── ParticipantSubscribes ─────────────────────────────────────────────────────

describe('POST /api/channels/:id/subscribe', () => {
    let store, app;
    let account, channel;

    beforeEach(async () => {
        ({ store, app } = makeApp());
        account = await httpCreateAccount(app, 'google-sub-test');
        channel = await store.createChannel({
            instructor_oauth_id: 'instructor-1',
            name:                'Test Channel',
            created_at:          new Date().toISOString(),
        });
    });

    it('subscribes an account to a channel', async () => {
        const res = await request(app)
            .post(`/api/channels/${channel.id}/subscribe`)
            .set('Authorization', `Bearer ${account.token}`)
            .send({ account_id: account.id });
        expect(res.status).toBe(201);
        expect(res.body.account_id).toBe(account.id);
        expect(res.body.channel_id).toBe(channel.id);
    });

    // rule-entity-creation.ParticipantSubscribes.1
    it('subscription has id, account_id, and channel_id', async () => {
        const res = await request(app)
            .post(`/api/channels/${channel.id}/subscribe`)
            .set('Authorization', `Bearer ${account.token}`)
            .send({ account_id: account.id });
        expect(res.body.id).toBeTruthy();
        expect(res.body.account_id).toBe(account.id);
        expect(res.body.channel_id).toBe(channel.id);
    });

    // rule-failure.ParticipantSubscribes.1
    it('rejects a duplicate subscription', async () => {
        await request(app)
            .post(`/api/channels/${channel.id}/subscribe`)
            .set('Authorization', `Bearer ${account.token}`)
            .send({ account_id: account.id });

        const res = await request(app)
            .post(`/api/channels/${channel.id}/subscribe`)
            .set('Authorization', `Bearer ${account.token}`)
            .send({ account_id: account.id });
        expect(res.status).toBe(409);
    });

    it('allows the same account to subscribe to different channels', async () => {
        const ch2 = await store.createChannel({
            instructor_oauth_id: 'instructor-2',
            name:                'Another Channel',
            created_at:          new Date().toISOString(),
        });
        const r1 = await request(app)
            .post(`/api/channels/${channel.id}/subscribe`)
            .set('Authorization', `Bearer ${account.token}`)
            .send({ account_id: account.id });
        const r2 = await request(app)
            .post(`/api/channels/${ch2.id}/subscribe`)
            .set('Authorization', `Bearer ${account.token}`)
            .send({ account_id: account.id });
        expect(r1.status).toBe(201);
        expect(r2.status).toBe(201);
    });

    it('returns 401 when no token is provided', async () => {
        const res = await request(app)
            .post(`/api/channels/${channel.id}/subscribe`)
            .send({ account_id: account.id });
        expect(res.status).toBe(401);
    });

    it('returns 403 when token does not match account_id', async () => {
        const other = await httpCreateAccount(app, 'google-sub-other');
        const res = await request(app)
            .post(`/api/channels/${channel.id}/subscribe`)
            .set('Authorization', `Bearer ${other.token}`)
            .send({ account_id: account.id });
        expect(res.status).toBe(403);
    });

    it('returns 404 for an unknown channel', async () => {
        const res = await request(app)
            .post('/api/channels/nonexistent/subscribe')
            .set('Authorization', `Bearer ${account.token}`)
            .send({ account_id: account.id });
        expect(res.status).toBe(404);
    });

    it('returns 400 when account_id is absent', async () => {
        const res = await request(app)
            .post(`/api/channels/${channel.id}/subscribe`)
            .set('Authorization', `Bearer ${account.token}`)
            .send({});
        expect(res.status).toBe(400);
    });
});
