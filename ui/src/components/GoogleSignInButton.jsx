import { useRef, useEffect } from 'preact/hooks';
import { renderGoogleButton, signingIn, signInError } from '../store/auth.js';

export function GoogleSignInButton() {
    const ref = useRef(null);
    useEffect(() => { renderGoogleButton(ref.current); }, []);
    return (
        <div>
            <div ref={ref} class="google-signin-container" />
            {signingIn.value  && <p class="signin-hint">Signing in…</p>}
            {signInError.value && <p class="signin-error">{signInError.value}</p>}
        </div>
    );
}
