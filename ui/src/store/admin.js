import { signal } from '@preact/signals';
import { accountId } from './auth.js';

export const isAdmin       = signal(false);
export const adminAccounts = signal([]);
export const adminChannels = signal([]);

async function adminReq(path) {
    const r = await fetch(path, { headers: { 'X-Account-Id': accountId.value } });
    if (!r.ok) {
        const err = new Error();
        err.status = r.status;
        throw err;
    }
    return r.json();
}

export async function checkAdminAccess() {
    if (!accountId.value) { isAdmin.value = false; return; }
    try {
        await adminReq('/api/admin/access');
        isAdmin.value = true;
    } catch {
        isAdmin.value = false;
    }
}

export async function loadAdminData() {
    if (!isAdmin.value) return;
    const [accounts, channels] = await Promise.all([
        adminReq('/api/admin/accounts'),
        adminReq('/api/admin/channels'),
    ]);
    adminAccounts.value = accounts;
    adminChannels.value = channels;
}
