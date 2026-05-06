import { useEffect } from 'preact/hooks';
import { Sidebar } from './components/Sidebar.jsx';
import { Editor } from './components/Editor.jsx';
import { Modal } from './components/Modal.jsx';
import { GoogleSignInButton } from './components/GoogleSignInButton.jsx';
import { ChannelPage } from './pages/ChannelPage.jsx';
import { SubscriptionView } from './pages/SubscriptionView.jsx';
import { HomePage } from './pages/HomePage.jsx';
import { SetupPage } from './pages/SetupPage.jsx';
import { AdminPage } from './pages/AdminPage.jsx';
import { isSignedIn, accountId, restoreSession } from './store/auth.js';
import { currentView, loadParticipantData, showChannel, showHome, showSetup } from './store/dashboard.js';
import { checkAdminAccess } from './store/admin.js';
import { channels, loadChannels } from './store/channels.js';
import { subscriptions } from './store/subscriptions.js';
import { devices } from './store/devices.js';
import { selected } from './store/programmes.js';
import { participantApi } from './store/api.js';
import { takePendingDeviceCode } from './store/pendingDevice.js';

function MainArea() {
    const view = currentView.value;

    if (view?.type === 'channel') {
        return <ChannelPage channelId={view.id} />;
    }

    if (view?.type === 'programme') {
        const prog = selected.value;
        return (
            <div class="main-content editor-view">
                <button class="btn-ghost back-btn"
                    onClick={() => showChannel(view.channel_id)}>
                    ← Back to channel
                </button>
                {prog ? <Editor prog={prog} /> : <p class="loading">Loading…</p>}
            </div>
        );
    }

    if (view?.type === 'subscription') {
        return <SubscriptionView channelId={view.channel_id} programmeId={view.programme_id} subscriptions={subscriptions} />;
    }

    if (view?.type === 'setup') {
        return <SetupPage />;
    }

    if (view?.type === 'admin') {
        return <AdminPage />;
    }

    // Default: home dashboard
    return <HomePage />;
}

export function App() {
    // On first mount: silently restore existing session then load data.
    useEffect(() => {
        restoreSession().then(() => {
            if (isSignedIn()) {
                loadChannels();
                loadParticipantData();
            }
        });
    }, []);

    // Whenever accountId changes (sign-in or sign-out), reload or clear data.
    // If a device_code was passed in the URL, register it silently before loading.
    useEffect(() => {
        if (!accountId.value) return;
        const code = takePendingDeviceCode();
        async function load() {
            if (code) {
                try { await participantApi.registerDevice(code); } catch {}
                history.replaceState({}, '', '/');
            }
            await Promise.all([loadChannels(), loadParticipantData(), checkAdminAccess()]);
            // First-time users with no watch or subscriptions go straight to the wizard.
            if (!code && currentView.value === null && devices.value.length === 0 && subscriptions.value.length === 0) {
                showSetup();
            }
        }
        load();
    }, [accountId.value]);

    if (!isSignedIn()) {
        return (
            <div class="landing">
                <div class="landing-image">
                    <img src="/images/banner.png" alt="Group running with Leadout on Garmin watches" />
                </div>
                <div class="landing-content">
                    <div class="landing-logo">Leadout</div>
                    <div class="landing-cta">
                        <p class="landing-cta-label">Get started now by signing in</p>
                        <GoogleSignInButton />
                    </div>
                    <h1 class="landing-headline">Every watch<br/>starts together.</h1>
                    <p class="landing-sub">
                        Publish your interval session once. Every participant's Garmin
                        downloads it automatically. Count down from three, press lap —
                        and the whole group begins at exactly the same moment.
                    </p>
                    <ul class="landing-features">
                        <li>Build structured sessions in minutes — time, distance, or pace targets</li>
                        <li>Watches sync overnight so nothing needs doing on the day</li>
                        <li>Vibration and audio alerts at every transition, no phone required</li>
                        <li>Free to use · Works with any Connect IQ Garmin</li>
                    </ul>
                </div>
                <Modal />
            </div>
        );
    }

    return (
        <div class="layout">
            <Sidebar />
            <main class="main">
                <MainArea />
            </main>
            <Modal />
        </div>
    );
}
