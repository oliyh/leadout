import { useEffect, useState } from 'preact/hooks';
import { accountId, isSignedIn } from '../store/auth.js';
import { GoogleSignInButton } from '../components/GoogleSignInButton.jsx';
import { participantApi } from '../store/api.js';

const STATE_LOADING   = 'loading';
const STATE_NOT_FOUND = 'not_found';
const STATE_SIGN_IN   = 'sign_in';
const STATE_SUBSCRIBE = 'subscribe';

export function JoinPage({ channelId }) {
    const [channel, setChannel]     = useState(null);
    const [flowState, setFlowState] = useState(STATE_LOADING);
    const [subscribing, setSubscribing] = useState(false);
    const [subError, setSubError]   = useState(null);

    useEffect(() => {
        participantApi.getChannel(channelId)
            .then(ch => {
                setChannel(ch);
                setFlowState(isSignedIn() ? STATE_SUBSCRIBE : STATE_SIGN_IN);
            })
            .catch(() => setFlowState(STATE_NOT_FOUND));
    }, [channelId]);

    // After sign-in completes, advance to subscribe step
    useEffect(() => {
        if (flowState === STATE_SIGN_IN && isSignedIn()) {
            setFlowState(STATE_SUBSCRIBE);
        }
    }, [accountId.value]);

    async function handleSubscribe() {
        setSubscribing(true);
        setSubError(null);
        try {
            await participantApi.subscribe(channelId, accountId.value);
            window.location.href = `/subscriptions/${channelId}`;
        } catch (err) {
            if (err.message === 'already subscribed') {
                window.location.href = `/subscriptions/${channelId}`;
            } else {
                setSubError(err.message);
                setSubscribing(false);
            }
        }
    }

    if (flowState === STATE_LOADING) {
        return <Page><p class="muted">Loading…</p></Page>;
    }

    if (flowState === STATE_NOT_FOUND) {
        return (
            <Page>
                <h2>Channel not found</h2>
                <p class="muted">This link may be out of date. Ask your instructor for a new one.</p>
            </Page>
        );
    }

    if (flowState === STATE_SIGN_IN) {
        return (
            <Page>
                <div data-testid="join-channel-name" class="join-channel-name">{channel.name}</div>
                <p data-testid="join-signin-prompt">Sign in to subscribe to this channel and receive session programmes on your watch.</p>
                <GoogleSignInButton />
            </Page>
        );
    }

    if (flowState === STATE_SUBSCRIBE) {
        return (
            <Page>
                <div data-testid="join-channel-name" class="join-channel-name">{channel.name}</div>
                <p>Subscribe to receive interval session programmes on your Garmin watch.</p>
                {subError && <p class="error">{subError}</p>}
                <button
                    data-testid="subscribe-btn"
                    class="btn-primary btn-wide"
                    onClick={handleSubscribe}
                    disabled={subscribing}
                >
                    {subscribing ? 'Subscribing…' : 'Subscribe to this channel'}
                </button>
            </Page>
        );
    }

    return null;
}

function Page({ children }) {
    return (
        <div class="participant-page">
            <header class="participant-header">
                <span class="logo">Leadout</span>
            </header>
            <main class="participant-main">
                {children}
            </main>
        </div>
    );
}
