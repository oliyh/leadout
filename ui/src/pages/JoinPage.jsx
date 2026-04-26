import { useEffect, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { accountId, isSignedIn, signIn, signingIn, signInError } from '../store/auth.js';
import { participantApi } from '../store/api.js';

// States for the subscription flow
const STATE_LOADING    = 'loading';
const STATE_NOT_FOUND  = 'not_found';
const STATE_SIGN_IN    = 'sign_in';
const STATE_SUBSCRIBE  = 'subscribe';
const STATE_SUBSCRIBED = 'subscribed';
const STATE_ERROR      = 'error';

export function JoinPage({ channelId }) {
    const [channel, setChannel]   = useState(null);
    const [flowState, setFlowState] = useState(STATE_LOADING);
    const [subscribing, setSubscribing] = useState(false);
    const [subError, setSubError] = useState(null);

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
            setFlowState(STATE_SUBSCRIBED);
        } catch (err) {
            // 409 means already subscribed — treat that as success
            if (err.message === 'already subscribed') {
                setFlowState(STATE_SUBSCRIBED);
            } else {
                setSubError(err.message);
            }
        } finally {
            setSubscribing(false);
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
                <div class="join-channel-name">{channel.name}</div>
                <p>Sign in to subscribe to this channel and receive session programmes on your watch.</p>
                {signInError.value && <p class="error">{signInError.value}</p>}
                <button
                    class="btn-primary btn-wide"
                    onClick={signIn}
                    disabled={signingIn.value}
                >
                    {signingIn.value ? 'Signing in…' : 'Sign in with Google'}
                </button>
            </Page>
        );
    }

    if (flowState === STATE_SUBSCRIBE) {
        return (
            <Page>
                <div class="join-channel-name">{channel.name}</div>
                <p>Subscribe to receive interval session programmes on your Garmin watch.</p>
                {subError && <p class="error">{subError}</p>}
                <button
                    class="btn-primary btn-wide"
                    onClick={handleSubscribe}
                    disabled={subscribing}
                >
                    {subscribing ? 'Subscribing…' : 'Subscribe to this channel'}
                </button>
            </Page>
        );
    }

    if (flowState === STATE_SUBSCRIBED) {
        return (
            <Page>
                <div class="join-channel-name">{channel.name}</div>
                <div class="success-state">
                    <div class="success-icon">✓</div>
                    <h2>You're subscribed!</h2>
                    <p>
                        Your watch will automatically sync upcoming session programmes.
                        Make sure your Leadout data field is installed on your watch.
                    </p>
                </div>
                <hr />
                <p class="muted" style="margin-top: 1rem;">
                    First time? <a href="/register">Register your watch</a> so it can receive programmes.
                </p>
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
