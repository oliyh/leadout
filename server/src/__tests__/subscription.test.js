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

// ── InstructorCreatesChannel ──────────────────────────────────────────────────

describe('POST /api/channels', () => {
    it('creates a channel', async () => {
        const { app } = makeApp();
        const res = await request(app).post('/api/channels').send({
            instructor_oauth_id: 'instructor-abc',
            name: 'Tuesday Runs with Sarah',
        });
        expect(res.status).toBe(201);
        expect(res.body.id).toBeTruthy();
        expect(res.body.name).toBe('Tuesday Runs with Sarah');
    });

    // rule-entity-creation.InstructorCreatesChannel.1
    it('channel has instructor_oauth_id, name, and created_at', async () => {
        const { app } = makeApp();
        const res = await request(app).post('/api/channels').send({
            instructor_oauth_id: 'instructor-def',
            name: 'Morning Group',
        });
        expect(res.body.instructor_oauth_id).toBe('instructor-def');
        expect(res.body.name).toBe('Morning Group');
        expect(res.body.created_at).toBeTruthy();
        expect(new Date(res.body.created_at).getTime()).not.toBeNaN();
    });

    it('returns 400 when required fields are missing', async () => {
        const { app } = makeApp();
        const res = await request(app).post('/api/channels').send({ name: 'No instructor' });
        expect(res.status).toBe(400);
    });
});

// ── ParticipantSubscribes ─────────────────────────────────────────────────────

describe('POST /api/channels/:id/subscribe', () => {
    let store, app;
    let account, channel;

    beforeEach(async () => {
        ({ store, app } = makeApp());
        account = await store.findOrCreateAccount('google-sub-test');
        channel = await store.createChannel({
            instructor_oauth_id: 'instructor-1',
            name:                'Test Channel',
            created_at:          new Date().toISOString(),
        });
    });

    it('subscribes an account to a channel', async () => {
        const res = await request(app)
            .post(`/api/channels/${channel.id}/subscribe`)
            .send({ account_id: account.id });
        expect(res.status).toBe(201);
        expect(res.body.account_id).toBe(account.id);
        expect(res.body.channel_id).toBe(channel.id);
    });

    // rule-entity-creation.ParticipantSubscribes.1
    it('subscription has id, account_id, and channel_id', async () => {
        const res = await request(app)
            .post(`/api/channels/${channel.id}/subscribe`)
            .send({ account_id: account.id });
        expect(res.body.id).toBeTruthy();
        expect(res.body.account_id).toBe(account.id);
        expect(res.body.channel_id).toBe(channel.id);
    });

    // rule-failure.ParticipantSubscribes.1
    it('rejects a duplicate subscription', async () => {
        await request(app)
            .post(`/api/channels/${channel.id}/subscribe`)
            .send({ account_id: account.id });

        const res = await request(app)
            .post(`/api/channels/${channel.id}/subscribe`)
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
            .send({ account_id: account.id });
        const r2 = await request(app)
            .post(`/api/channels/${ch2.id}/subscribe`)
            .send({ account_id: account.id });
        expect(r1.status).toBe(201);
        expect(r2.status).toBe(201);
    });

    it('returns 404 for an unknown channel', async () => {
        const res = await request(app)
            .post('/api/channels/nonexistent/subscribe')
            .send({ account_id: account.id });
        expect(res.status).toBe(404);
    });

    it('returns 400 when account_id is absent', async () => {
        const res = await request(app)
            .post(`/api/channels/${channel.id}/subscribe`)
            .send({});
        expect(res.status).toBe(400);
    });
});
