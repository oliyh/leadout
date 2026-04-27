import { useEffect } from 'preact/hooks';
import { Sidebar } from './components/Sidebar.jsx';
import { Editor } from './components/Editor.jsx';
import { Modal } from './components/Modal.jsx';
import { ChannelPage } from './pages/ChannelPage.jsx';
import { SubscriptionView } from './pages/SubscriptionView.jsx';
import { ParticipantPanel } from './pages/ParticipantPanel.jsx';
import { isSignedIn, accountId, restoreSession } from './store/auth.js';
import { currentView, channels, subscriptions, loadChannels, loadParticipantData, showChannel, showHome } from './store/dashboard.js';
import { selected } from './store/programmes.js';

function MainArea() {
    const view = currentView.value;

    if (!isSignedIn()) {
        return (
            <div class="main-content empty-state">
                <div class="welcome">
                    <h1>Leadout</h1>
                    <p>Group interval training for Garmin watches.</p>
                    <p>Sign in to manage your channels or subscribe to an instructor.</p>
                </div>
            </div>
        );
    }

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
        return <SubscriptionView channelId={view.channel_id} subscriptions={subscriptions} />;
    }

    // Default: home dashboard
    return (
        <div class="main-content home-dashboard">
            <div class="dashboard-welcome">
                <h2>Welcome back</h2>
                <p>Select a channel from the sidebar to manage programmes, or click a subscription to view upcoming sessions.</p>
            </div>
            <ParticipantPanel />
        </div>
    );
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
