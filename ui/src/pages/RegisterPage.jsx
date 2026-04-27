import { useState } from 'preact/hooks';
import { accountId } from '../store/auth.js';
import { GoogleSignInButton } from '../components/GoogleSignInButton.jsx';
import { participantApi } from '../store/api.js';

export function RegisterPage() {
    // Read code from URL once; useState keeps it stable across re-renders.
    const [deviceCode, setDeviceCode] = useState(() =>
        (new URLSearchParams(window.location.search).get('code') ?? '').toUpperCase()
    );
    const [registering, setRegistering] = useState(false);
    const [regError, setRegError] = useState(null);
    const [done, setDone] = useState(false);

    // Reading accountId.value subscribes this component to sign-in/out changes.
    const signedIn = !!accountId.value;

    async function handleRegister(e) {
        e.preventDefault();
        const code = deviceCode.trim().toUpperCase();
        if (!code) return;
        setRegistering(true);
        setRegError(null);
        try {
            await participantApi.registerDevice(accountId.value, code);
            setDone(true);
        } catch (err) {
            setRegError(err.message === 'device_code already registered'
                ? 'This device code is already registered to an account.'
                : err.message);
        } finally {
            setRegistering(false);
        }
    }

    if (done) {
        return (
            <Page>
                <div class="success-state">
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
                <p>Sign in first so we can link your watch to your account.</p>
                {deviceCode && (
                    <p class="device-code-hint">
                        Device code <strong>{deviceCode}</strong> will be pre-filled after sign-in.
                    </p>
                )}
                <GoogleSignInButton />
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
