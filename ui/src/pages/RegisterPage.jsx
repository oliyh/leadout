import { useState } from 'preact/hooks';
import { accountId, isSignedIn, signIn, signingIn, signInError } from '../store/auth.js';
import { participantApi } from '../store/api.js';

const STATE_SIGN_IN  = 'sign_in';
const STATE_FORM     = 'form';
const STATE_SUCCESS  = 'success';

export function RegisterPage() {
    const [flowState, setFlowState] = useState(isSignedIn() ? STATE_FORM : STATE_SIGN_IN);
    const [deviceCode, setDeviceCode] = useState('');
    const [registering, setRegistering] = useState(false);
    const [regError, setRegError] = useState(null);

    // Advance past sign-in once auth completes
    if (flowState === STATE_SIGN_IN && isSignedIn()) {
        setFlowState(STATE_FORM);
    }

    async function handleRegister(e) {
        e.preventDefault();
        const code = deviceCode.trim().toUpperCase();
        if (!code) return;
        setRegistering(true);
        setRegError(null);
        try {
            await participantApi.registerDevice(accountId.value, code);
            setFlowState(STATE_SUCCESS);
        } catch (err) {
            setRegError(err.message === 'device_code already registered'
                ? 'This device code is already registered to an account.'
                : err.message);
        } finally {
            setRegistering(false);
        }
    }

    return (
        <Page>
            {flowState === STATE_SIGN_IN && (
                <>
                    <h2>Register your watch</h2>
                    <p>Sign in first so we can link your watch to your account.</p>
                    {signInError.value && <p class="error">{signInError.value}</p>}
                    <button
                        class="btn-primary btn-wide"
                        onClick={async () => { await signIn(); setFlowState(STATE_FORM); }}
                        disabled={signingIn.value}
                    >
                        {signingIn.value ? 'Signing in…' : 'Sign in with Google'}
                    </button>
                </>
            )}

            {flowState === STATE_FORM && (
                <>
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
                </>
            )}

            {flowState === STATE_SUCCESS && (
                <div class="success-state">
                    <div class="success-icon">✓</div>
                    <h2>Watch registered!</h2>
                    <p>
                        Your watch will receive programmes on its next sync.
                        Make sure you've also subscribed to your instructor's channel.
                    </p>
                </div>
            )}
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
