// Tests for device type enrichment on the GET /api/accounts/:id/devices endpoint.
// The server fetches device metadata from Garmin's app store API and caches it in memory.
// These tests mock global fetch so they run offline and deterministically.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp, _resetDeviceTypeCacheForTest } from '../../app.js';
import { DomainStore } from '../store/domain.js';

const FORERUNNER_265S = {
    id: '271',
    partNumber: '006-B4258-00',
    name: 'Forerunner® 265S',
    additionalNames: [],
    imageUrl: 'https://res.cloudinary.com/it-production/image/upload/v1673209517/Product_Images/en/products/010-02810-03/g/pd-01-sm.jpg',
    urlName: 'forerunner265s',
};

function makeApp() {
    return { app: createApp(new DomainStore()) };
}

function stubFetchWithTypes(types) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => types,
    }));
}

async function createAccount(app, googleId) {
    const res = await request(app).post('/api/auth/google').send({ google_id: googleId });
    return res.body; // includes .token
}

describe('Device type enrichment', () => {
    let app;

    beforeEach(() => {
        _resetDeviceTypeCacheForTest();
        stubFetchWithTypes([FORERUNNER_265S]);
        ({ app } = makeApp());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('resolves device_type_name and device_type_image for a known part number', async () => {
        const account = await createAccount(app, 'g-dt-01');
        await request(app).post('/api/devices')
            .set('Authorization', `Bearer ${account.token}`)
            .send({ account_id: account.id, device_code: 'DT-01' });
        await request(app).get('/api/sync/DT-01?model=006-B4258-00');

        const res = await request(app).get(`/api/accounts/${account.id}/devices`)
            .set('Authorization', `Bearer ${account.token}`);
        expect(res.status).toBe(200);
        const device = res.body[0];
        expect(device.device_type_name).toBe('Forerunner® 265S');
        expect(device.device_type_image).toBe(FORERUNNER_265S.imageUrl);
    });

    it('returns null device_type fields when model is not in the Garmin catalogue', async () => {
        const account = await createAccount(app, 'g-dt-02');
        await request(app).post('/api/devices')
            .set('Authorization', `Bearer ${account.token}`)
            .send({ account_id: account.id, device_code: 'DT-02' });
        await request(app).get('/api/sync/DT-02?model=UNKNOWN-PART');

        const res = await request(app).get(`/api/accounts/${account.id}/devices`)
            .set('Authorization', `Bearer ${account.token}`);
        const device = res.body[0];
        expect(device.device_type_name).toBeNull();
        expect(device.device_type_image).toBeNull();
    });

    it('returns null device_type fields when the device has never synced', async () => {
        const account = await createAccount(app, 'g-dt-03');
        await request(app).post('/api/devices')
            .set('Authorization', `Bearer ${account.token}`)
            .send({ account_id: account.id, device_code: 'DT-03' });

        const res = await request(app).get(`/api/accounts/${account.id}/devices`)
            .set('Authorization', `Bearer ${account.token}`);
        const device = res.body[0];
        expect(device.device_type_name).toBeNull();
        expect(device.device_type_image).toBeNull();
    });

    it('fetches the Garmin catalogue only once across multiple calls (in-memory cache)', async () => {
        const account = await createAccount(app, 'g-dt-04');
        await request(app).post('/api/devices')
            .set('Authorization', `Bearer ${account.token}`)
            .send({ account_id: account.id, device_code: 'DT-04A' });
        await request(app).post('/api/devices')
            .set('Authorization', `Bearer ${account.token}`)
            .send({ account_id: account.id, device_code: 'DT-04B' });

        await request(app).get(`/api/accounts/${account.id}/devices`)
            .set('Authorization', `Bearer ${account.token}`);
        await request(app).get(`/api/accounts/${account.id}/devices`)
            .set('Authorization', `Bearer ${account.token}`);

        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('returns 200 with null device_type fields when the Garmin API is unreachable', async () => {
        _resetDeviceTypeCacheForTest();
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

        const account = await createAccount(app, 'g-dt-05');
        await request(app).post('/api/devices')
            .set('Authorization', `Bearer ${account.token}`)
            .send({ account_id: account.id, device_code: 'DT-05' });
        await request(app).get('/api/sync/DT-05?model=006-B4258-00');

        const res = await request(app).get(`/api/accounts/${account.id}/devices`)
            .set('Authorization', `Bearer ${account.token}`);
        expect(res.status).toBe(200);
        const device = res.body[0];
        expect(device.device_type_name).toBeNull();
        expect(device.device_type_image).toBeNull();
    });
});
