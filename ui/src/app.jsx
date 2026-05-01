import { useEffect } from 'preact/hooks';
import { Sidebar } from './components/Sidebar.jsx';
import { Editor } from './components/Editor.jsx';
import { Modal } from './components/Modal.jsx';
import { GoogleSignInButton } from './components/GoogleSignInButton.jsx';
import { ChannelPage } from './pages/ChannelPage.jsx';
import { SubscriptionView } from './pages/SubscriptionView.jsx';
import { HomePage } from './pages/HomePage.jsx';
import { isSignedIn, accountId, restoreSession } from './store/auth.js';
import { currentView, channels, subscriptions, loadChannels, loadParticipantData, showChannel, showHome } from './store/dashboard.js';
import { selected } from './store/programmes.js';

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
    useEffect(() => {
        if (accountId.value) {
            loadChannels();
            loadParticipantData();
        }
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
