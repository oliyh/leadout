import { useEffect } from 'preact/hooks';
import { Sidebar } from './components/Sidebar.jsx';
import { ChannelPage } from './pages/ChannelPage.jsx';
import { SubscriptionView } from './pages/SubscriptionView.jsx';
import { ParticipantPanel } from './pages/ParticipantPanel.jsx';
import { isSignedIn, accountId } from './store/auth.js';
import { currentView, channels, subscriptions, loadChannels, loadParticipantData } from './store/dashboard.js';

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
    useEffect(() => {
        if (isSignedIn()) {
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
        </div>
    );
}
