import { useEffect, useRef, useState } from 'preact/hooks';
import { accountId, signOut } from '../store/auth.js';
import { GoogleSignInButton } from '../components/GoogleSignInButton.jsx';
import { participantApi } from '../store/api.js';

export function RegisterPage() {
    const [deviceCode, setDeviceCode] = useState(() =>
        (new URLSearchParams(window.location.search).get('code') ?? '').toUpperCase()
    );

    // True when the code arrived in the URL (i.e. from the watch QR link).
    // In this case we auto-register once the user is signed in.
    const codeFromUrl = useRef(
        !!(new URLSearchParams(window.location.search).get('code'))
    );

    const [registering, setRegistering] = useState(false);
    const [regError, setRegError] = useState(null);
    const [done, setDone] = useState(false);

    const signedIn = !!accountId.value;

    async function doRegister(code) {
        const clean = code.trim().toUpperCase();
        if (!clean) return;
        setRegistering(true);
        setRegError(null);
        try {
            await participantApi.registerDevice(accountId.value, clean);
            setDone(true);
        } catch (err) {
            if (err.message === 'account not found') {
                signOut();
                return;
            }
            setRegError(err.message === 'device_code already registered'
                ? 'This device code is already registered to an account.'
                : err.message);
        } finally {
            setRegistering(false);
        }
    }

    function handleRegister(e) {
        e.preventDefault();
        doRegister(deviceCode);
    }

    // Auto-register when the code came from the watch URL and the user is signed in.
    // Fires immediately if they were already signed in when they arrived, or once
    // sign-in completes if they weren't.
    useEffect(() => {
        if (signedIn && codeFromUrl.current && deviceCode && !done) {
            doRegister(deviceCode);
        }
    }, [signedIn]);

    if (done) {
        return (
            <Page>
                <div data-testid="register-success" class="success-state">
                    <div class="success-icon">✓</div>
                    <h2>Watch registered!</h2>
                    <p>
                        Your watch will receive programmes on its next sync.
                        Make sure you've also subscribed to your instructor's channel.
                    </p>
                </div>
            </Page>
        );
    }

    if (!signedIn) {
        return (
            <Page>
                <h2>Register your watch</h2>
                <p data-testid="register-signin-prompt">Sign in to link your watch to your account.</p>
                {deviceCode && (
                    <p data-testid="register-code-hint" class="device-code-hint">
                        Device code <strong>{deviceCode}</strong> will be registered after sign-in.
                    </p>
                )}
                <GoogleSignInButton />
            </Page>
        );
    }

    // Signed in with a URL code — show a brief registering state before success/error.
    if (codeFromUrl.current && registering) {
        return (
            <Page>
                <p class="muted">Registering your watch…</p>
            </Page>
        );
    }

    return (
        <Page>
            <h2>Register your watch</h2>
            <p>
                Open the Leadout data field on your Garmin watch. It will display a
                short device code. Enter it below to link your watch to your account.
            </p>
            <form onSubmit={handleRegister} class="register-form">
                <label class="field-label" for="device-code">Device code</label>
                <input
                    id="device-code"
                    class="device-code-input"
                    type="text"
                    placeholder="e.g. A1B2C3"
                    value={deviceCode}
                    onInput={e => setDeviceCode(e.target.value)}
                    maxLength={16}
                    autoFocus
                    autoCapitalize="characters"
                    spellCheck={false}
                />
                {regError && <p class="error">{regError}</p>}
                <button
                    data-testid="register-watch-btn"
                    class="btn-primary btn-wide"
                    type="submit"
                    disabled={registering || !deviceCode.trim()}
                >
                    {registering ? 'Registering…' : 'Register watch'}
                </button>
            </form>
        </Page>
    );
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
