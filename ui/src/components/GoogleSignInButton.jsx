import { useRef, useEffect } from 'preact/hooks';
import { renderGoogleButton, signingIn, signInError, devSignIn } from '../store/auth.js';

const DEV_AUTH = import.meta.env.VITE_DEV_AUTH === 'true';

export function GoogleSignInButton() {
    const ref = useRef(null);
    useEffect(() => { if (!DEV_AUTH) renderGoogleButton(ref.current); }, []);
    return (
        <div>
            {DEV_AUTH ? (
                <button class="btn-dev-signin" onClick={devSignIn} disabled={signingIn.value}>
                    {signingIn.value ? 'Signing in…' : 'Dev sign-in (bypass Google)'}
                </button>
            ) : (
                <div ref={ref} class="google-signin-container" />
            )}
            {signingIn.value   && !DEV_AUTH && <p class="signin-hint">Signing in…</p>}
            {signInError.value && <p class="signin-error">{signInError.value}</p>}
        </div>
    );
}
