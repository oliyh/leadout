import { signal, effect } from '@preact/signals';
import { loadDevices } from './devices.js';
import { loadSubscriptions } from './subscriptions.js';

// Convenience: refresh all participant data together.
export async function loadParticipantData() {
    await Promise.all([loadDevices(), loadSubscriptions()]);
}

// ── Navigation ────────────────────────────────────────────────────────────────
// view:
//   null                                    → home
//   { type: 'channel',      id }            → channel page
//   { type: 'programme',    id, channel_id} → programme editor
//   { type: 'subscription', channel_id }    → subscription view

function viewFromURL() {
    const p = window.location.pathname;
    let m;
    if (p === '/setup')                                                   return { type: 'setup' };
    if (p === '/admin')                                                   return { type: 'admin' };
    if ((m = p.match(/^\/channels\/([^/]+)$/)))                         return { type: 'channel', id: m[1] };
    if ((m = p.match(/^\/subscriptions\/([^/]+)$/)))                    return { type: 'subscription', channel_id: m[1] };
    if ((m = p.match(/^\/subscriptions\/([^/]+)\/programme\/([^/]+)/))) return { type: 'subscription', channel_id: m[1], programme_id: m[2] };
    // Programme editor view is not restored on hard refresh (needs in-memory data).
    return null;
}

export const currentView = signal(viewFromURL());

// Keep browser URL in sync with currentView.
// Skip rewrite on standalone pages that manage their own URL space.
effect(() => {
    const current = window.location.pathname;
    if (current.startsWith('/join/') || current.startsWith('/register') || current.startsWith('/privacy')) return;
    const view = currentView.value;
    let url = '/';
    if (view?.type === 'setup')             url = '/setup';
    else if (view?.type === 'admin')        url = '/admin';
    else if (view?.type === 'channel')      url = `/channels/${view.id}`;
    else if (view?.type === 'subscription' && view.programme_id)
                                            url = `/subscriptions/${view.channel_id}/programme/${view.programme_id}`;
    else if (view?.type === 'subscription') url = `/subscriptions/${view.channel_id}`;
    else if (view?.type === 'programme')    url = `/channels/${view.channel_id}/programme/${view.id}`;
    if (current !== url) history.pushState(null, '', url);
});

// Handle browser back / forward.
window.addEventListener('popstate', () => { currentView.value = viewFromURL(); });

export function showChannel(id)              { currentView.value = { type: 'channel', id }; }
export function showSubscription(channel_id) { currentView.value = { type: 'subscription', channel_id }; }
export function showSubscriptionProgramme(channel_id, programme_id) { currentView.value = { type: 'subscription', channel_id, programme_id }; }
export function showProgrammeEditor(id, channel_id) { currentView.value = { type: 'programme', id, channel_id }; }
export function showSetup()                  { currentView.value = { type: 'setup' }; }
export function showAdmin()                  { currentView.value = { type: 'admin' }; }
export function showHome()                   { currentView.value = null; }

// Poll participant data every minute so upcoming programmes stay fresh.
setInterval(loadParticipantData, 60_000);
