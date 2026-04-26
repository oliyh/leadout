import { signal } from '@preact/signals';

// Stub auth store — replaces real Google OAuth until that is wired up.
// A stable pseudonymous google_id is generated once per browser and stored in
// localStorage. Signing in POSTs it to the server to get/create an Account.
// The returned account_id is also persisted so subsequent page loads are instant.

const LS_GOOGLE_ID  = 'leadout:pseudoGoogleId';
const LS_ACCOUNT_ID = 'leadout:accountId';

function loadedAccountId() { return localStorage.getItem(LS_ACCOUNT_ID) ?? null; }

export const accountId = signal(loadedAccountId());
export const signingIn = signal(false);
export const signInError = signal(null);

export function isSignedIn() { return accountId.value !== null; }

export async function signIn() {
    signingIn.value   = true;
    signInError.value = null;
    try {
        // Reuse the stable pseudonymous id if we already have one.
        let googleId = localStorage.getItem(LS_GOOGLE_ID);
        if (!googleId) {
            googleId = crypto.randomUUID();
            localStorage.setItem(LS_GOOGLE_ID, googleId);
        }

        const res = await fetch('/api/auth/google', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ google_id: googleId }),
        });
        if (!res.ok) throw new Error('Sign-in failed');
        const account = await res.json();
        localStorage.setItem(LS_ACCOUNT_ID, account.id);
        accountId.value = account.id;
    } catch (err) {
        signInError.value = err.message;
    } finally {
        signingIn.value = false;
    }
}

export function signOut() {
    localStorage.removeItem(LS_ACCOUNT_ID);
    accountId.value = null;
}
