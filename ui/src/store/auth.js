import { signal } from '@preact/signals';

const LS_GOOGLE_ID  = 'leadout:googleId';
const LS_ACCOUNT_ID = 'leadout:accountId';

export const accountId   = signal(localStorage.getItem(LS_ACCOUNT_ID) ?? null);
export const signingIn   = signal(false);
export const signInError = signal(null);

export function isSignedIn() { return accountId.value !== null; }

async function handleCredentialResponse(response) {
    signingIn.value   = true;
    signInError.value = null;
    try {
        const res = await fetch('/api/auth/google-token', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ token: response.credential }),
        });
        if (!res.ok) throw new Error(await res.text());
        const account = await res.json();
        localStorage.setItem(LS_ACCOUNT_ID, account.id);
        localStorage.setItem(LS_GOOGLE_ID,  account.google_id);
        accountId.value = account.id;
    } catch (err) {
        signInError.value = 'Sign-in failed. Check the console.';
        console.error('Google sign-in error:', err);
    } finally {
        signingIn.value = false;
    }
}

let _gisInitialized = false;
function ensureGIS() {
    if (_gisInitialized) return true;
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId || !window.google?.accounts?.id) return false;
    window.google.accounts.id.initialize({ client_id: clientId, callback: handleCredentialResponse });
    _gisInitialized = true;
    return true;
}

// Renders the official Google Sign-In button into `el`.
// Retries until GIS script has loaded (up to ~4 seconds).
export function renderGoogleButton(el, attempt = 0) {
    if (!el) return;
    if (!import.meta.env.VITE_GOOGLE_CLIENT_ID) {
        el.innerHTML = '<p class="signin-error">VITE_GOOGLE_CLIENT_ID not set.</p>';
        return;
    }
    if (!ensureGIS()) {
        if (attempt > 20) { el.innerHTML = '<p class="signin-error">Google Sign-In failed to load.</p>'; return; }
        setTimeout(() => renderGoogleButton(el, attempt + 1), 200);
        return;
    }
    window.google.accounts.id.renderButton(el, { theme: 'outline', size: 'large', text: 'sign_in_with' });
}

export function signOut() {
    localStorage.removeItem(LS_ACCOUNT_ID);
    localStorage.removeItem(LS_GOOGLE_ID);
    accountId.value = null;
    _gisInitialized = false;
}

// Called on every app startup. Uses the stored google_id to re-confirm the
// account without a fresh id_token (safe since google_id is a stable sub claim).
export async function restoreSession() {
    const googleId = localStorage.getItem(LS_GOOGLE_ID);
    if (!googleId) return;
    try {
        const res = await fetch('/api/auth/google', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ google_id: googleId }),
        });
        if (!res.ok) { localStorage.removeItem(LS_ACCOUNT_ID); return; }
        const account = await res.json();
        localStorage.setItem(LS_ACCOUNT_ID, account.id);
        accountId.value = account.id;
    } catch {}
}
