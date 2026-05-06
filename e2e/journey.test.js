import { test, expect } from '@playwright/test';

function today() { return new Date().toISOString().slice(0, 10); }

// Sign in via the test-only auth endpoint, then seed localStorage so the app
// treats the browser session as authenticated on next load.
async function signInAs(page, googleId) {
    const res = await page.request.post('/api/auth/test', {
        data: { google_id: googleId },
    });
    expect(res.ok()).toBeTruthy();
    const account = await res.json();

    await page.goto('/');
    await page.evaluate(({ accountId, googleId }) => {
        localStorage.setItem('leadout:accountId', accountId);
        localStorage.setItem('leadout:googleId', googleId);
    }, { accountId: account.id, googleId });
    await page.reload();
    return account;
}

test('instructor creates channel and programme; participant subscribes and syncs', async ({ browser }) => {
    const instructorCtx  = await browser.newContext();
    const participantCtx = await browser.newContext();

    try {
        const instructorPage  = await instructorCtx.newPage();
        const participantPage = await participantCtx.newPage();

        // ── Instructor: sign in ──────────────────────────────────────────────────
        // New users land on the setup wizard (/setup) — instructor skips to step 4
        // and creates a channel from there.

        await signInAs(instructorPage, 'e2e-instructor-001');
        await instructorPage.waitForURL('/setup');

        await instructorPage.getByTestId('setup-next-btn').click(); // step 1 → 2
        await instructorPage.getByTestId('setup-next-btn').click(); // step 2 → 3
        await instructorPage.getByTestId('setup-next-btn').click(); // step 3 → 4 (skipping device registration)

        // ── Instructor: create channel ───────────────────────────────────────────

        await instructorPage.getByTestId('wizard-create-channel-btn').click();
        await instructorPage.getByTestId('channel-name-input').fill('Thursday Track');
        await instructorPage.getByTestId('create-channel-submit').click();

        await instructorPage.waitForURL(/\/channels\//);
        const channelId = instructorPage.url().match(/\/channels\/([^/]+)/)[1];

        // ── Instructor: create programme ─────────────────────────────────────────

        await instructorPage.getByTestId('new-programme-btn').click();
        await instructorPage.getByTestId('programme-name-input').fill('5x1000m Intervals');
        await instructorPage.getByTestId('programme-date-input').fill(today());
        await instructorPage.getByTestId('create-programme-submit').click();

        // Programme created → editor opens
        await instructorPage.waitForURL(/\/programme\//);

        // ── Participant: sign in and register device ─────────────────────────────

        const deviceCode = 'TESTD1';

        await signInAs(participantPage, 'e2e-participant-001');
        await participantPage.waitForURL('/setup');

        await participantPage.getByTestId('setup-next-btn').click(); // step 1 → 2
        await participantPage.getByTestId('setup-next-btn').click(); // step 2 → 3

        await participantPage.getByTestId('device-code-input').fill(deviceCode);
        await participantPage.getByTestId('register-device-submit').click();

        // Step 3 auto-advances to step 4 on success
        await expect(participantPage.getByTestId('setup-done-btn')).toBeVisible();
        await participantPage.getByTestId('setup-done-btn').click();

        // ── Participant: subscribe to channel ────────────────────────────────────

        await participantPage.goto(`/join/${channelId}`);
        await participantPage.getByTestId('subscribe-btn').click();
        await participantPage.waitForURL(`/subscriptions/${channelId}`);

        // ── Simulate device sync ─────────────────────────────────────────────────
        // Represents the Garmin watch polling the server after programme download.

        const syncRes = await participantPage.request.get(`/api/sync/${deviceCode}`);
        expect(syncRes.status()).toBe(200);

        const syncBody = await syncRes.json();
        expect(syncBody.programmes).toHaveLength(1);
        expect(syncBody.programmes[0].name).toBe('5x1000m Intervals');

        // ── Participant: device shows last synced timestamp ───────────────────────
        // Reload to pick up updated last_synced_at from server.

        await participantPage.goto('/');
        await expect(participantPage.getByTestId('device-last-synced')).not.toContainText('never');

        // ── Instructor: propagation badge shows 1/1 synced ──────────────────────
        // Navigate to the channel page; the badge fetches propagation data on mount.

        await instructorPage.goto(`/channels/${channelId}`);
        await expect(instructorPage.getByTestId('propagation-badge')).toContainText('1/1 synced');

    } finally {
        await instructorCtx.close();
        await participantCtx.close();
    }
});
