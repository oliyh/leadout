import { test, expect } from '@playwright/test';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createAccount(page, googleId) {
    const res = await page.request.post('/api/auth/test', { data: { google_id: googleId } });
    expect(res.ok()).toBeTruthy();
    return res.json(); // { id, google_id, created_at, token }
}

async function createChannel(page, instructor, name) {
    const res = await page.request.post('/api/channels', {
        headers: { 'Authorization': `Bearer ${instructor.token}` },
        data: { instructor_oauth_id: instructor.id, name },
    });
    expect(res.ok()).toBeTruthy();
    return res.json();
}

// Seeds the session into localStorage without navigating away.
// Call this after visiting the target page to simulate Google OAuth completing.
async function completeSignIn(page, account) {
    await page.evaluate(({ id, google_id, token }) => {
        localStorage.setItem('leadout:accountId', id);
        localStorage.setItem('leadout:googleId', google_id);
        localStorage.setItem('leadout:token', token);
    }, account);
    await page.reload();
}

test.beforeEach(async ({ request }) => {
    await request.post('/api/test/reset');
});

// ── Journey: join channel link while signed out ───────────────────────────────

test('signed-out user visits join link, signs in, and subscribes to channel', async ({ page }) => {

    const instructor = await createAccount(page, 'e2e-unauth-join-instructor');
    const channel    = await createChannel(page, instructor, 'Saturday Intervals');
    const participant = await createAccount(page, 'e2e-unauth-join-participant');

    // ── Visit the join page while not signed in ───────────────────────────────

    await page.goto(`/join/${channel.id}`);

    await expect(page.getByTestId('join-channel-name')).toHaveText('Saturday Intervals');
    await expect(page.getByTestId('join-signin-prompt')).toBeVisible();
    await expect(page.getByTestId('subscribe-btn')).not.toBeVisible();

    // ── Simulate Google sign-in completing ────────────────────────────────────

    await completeSignIn(page, participant);

    // ── Subscribe ─────────────────────────────────────────────────────────────

    await expect(page.getByTestId('join-channel-name')).toHaveText('Saturday Intervals');
    await expect(page.getByTestId('subscribe-btn')).toBeVisible();

    await page.getByTestId('subscribe-btn').click();
    await page.waitForURL(`/subscriptions/${channel.id}`);
});

// ── Journey: watch QR code registration while signed out ──────────────────────

test('signed-out user scans watch QR code, signs in, and watch registers automatically', async ({ page }) => {

    // Timestamp-based code so re-runs don't collide with previous registrations.
    const deviceCode = `QR${Date.now().toString(36).slice(-4).toUpperCase()}`;

    const account = await createAccount(page, 'e2e-unauth-register-watch');

    // ── Visit the register page while not signed in ───────────────────────────

    await page.goto(`/register?code=${deviceCode}`);

    await expect(page.getByTestId('register-signin-prompt')).toBeVisible();
    await expect(page.getByTestId('register-code-hint')).toContainText(deviceCode);
    await expect(page.getByTestId('register-watch-btn')).not.toBeVisible();

    // ── Simulate Google sign-in completing ────────────────────────────────────

    await completeSignIn(page, account);

    // ── Auto-register fires — no button click needed ──────────────────────────

    await expect(page.getByTestId('register-success')).toBeVisible();

    // Confirm the device is registered server-side.
    const syncRes = await page.request.get(`/api/sync/${deviceCode}`);
    expect(syncRes.status()).toBe(200);
});
