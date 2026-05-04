import { useEffect } from 'preact/hooks';
import { Sidebar } from './components/Sidebar.jsx';
import { Editor } from './components/Editor.jsx';
import { Modal } from './components/Modal.jsx';
import { GoogleSignInButton } from './components/GoogleSignInButton.jsx';
import { ChannelPage } from './pages/ChannelPage.jsx';
import { SubscriptionView } from './pages/SubscriptionView.jsx';
import { HomePage } from './pages/HomePage.jsx';
import { SetupPage } from './pages/SetupPage.jsx';
import { isSignedIn, accountId, restoreSession } from './store/auth.js';
import { currentView, channels, subscriptions, devices, loadChannels, loadParticipantData, showChannel, showHome, showSetup } from './store/dashboard.js';
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
                try { await participantApi.registerDevice(accountId.value, code); } catch {}
                history.replaceState({}, '', '/');
            }
            await Promise.all([loadChannels(), loadParticipantData()]);
            // First-time users with no watch or subscriptions go straight to the wizard.
            if (!code && currentView.value === null && devices.value.length === 0 && subscriptions.value.length === 0) {
                showSetup();
            }
        }
        load();
    }, [accountId.value]);

    if (!isSignedIn()) {
        return (
            <div class="signin-page">
                <div class="signin-card">
                    <div class="logo signin-logo">Leadout</div>
                    <p>Group interval training for Garmin watches.</p>
                    <p>Sign in to manage your channels or subscribe to an instructor.</p>
                    <GoogleSignInButton />
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
