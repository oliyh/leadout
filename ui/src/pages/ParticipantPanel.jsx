import { useState } from 'preact/hooks';
import { accountId } from '../store/auth.js';
import { participantApi } from '../store/api.js';
import { devices, loadParticipantData } from '../store/dashboard.js';

function DeviceOnboarding() {
    const [code, setCode] = useState('');
    const [error, setError] = useState(null);
    const [done, setDone] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    async function submit(e) {
        e.preventDefault();
        const clean = code.trim().toUpperCase();
        if (clean.length !== 6) { setError('Code must be 6 characters'); return; }
        setSubmitting(true);
        setError(null);
        try {
            await participantApi.registerDevice(accountId.value, clean);
            await loadParticipantData();
            setDone(true);
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    }

    if (done) return (
        <div class="onboarding-success">
            <p>Device registered! Your watch will sync programmes automatically.</p>
        </div>
    );

    return (
        <div class="device-onboarding">
            <h3>Register your watch</h3>
            <ol class="onboarding-steps">
                <li>Install the Leadout app from the Garmin Connect IQ Store</li>
                <li>Add <strong>Leadout</strong> as a data field on a run activity</li>
                <li>Start a run — the data field will show a 6-character device code</li>
                <li>Enter the code below</li>
            </ol>
            <form class="register-form" onSubmit={submit}>
                <input
                    class="device-code-input"
                    value={code}
                    onInput={e => setCode(e.target.value.toUpperCase())}
                    placeholder="XXXXXX"
                    maxLength={6}
                    spellcheck={false}
                />
                {error && <p class="error">{error}</p>}
                <button type="submit" class="btn-primary" disabled={submitting}>
                    {submitting ? 'Registering…' : 'Register device'}
                </button>
            </form>
        </div>
    );
}

export function ParticipantPanel() {
    const devs = devices.value;

    return (
        <div class="participant-panel">
            <h2>My devices</h2>
            {devs.length === 0
                ? <DeviceOnboarding />
                : (
                    <>
                        <ul class="device-list">
                            {devs.map(d => (
                                <li key={d.id} class="device-item">
                                    <span class="device-code">{d.device_code}</span>
                                    <span class="device-meta">
                                        Registered {new Date(d.registered_at).toLocaleDateString('en-GB')}
                                        {d.last_synced_at && ` · Last synced ${new Date(d.last_synced_at).toLocaleDateString('en-GB')}`}
                                    </span>
                                </li>
                            ))}
                        </ul>
                        <p class="hint">To add another device, visit <a href="/register">/register</a> from your watch.</p>
                    </>
                )
            }
        </div>
    );
}
