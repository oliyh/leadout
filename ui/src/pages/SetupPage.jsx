import { useState } from 'preact/hooks';
import { accountId } from '../store/auth.js';
import { participantApi } from '../store/api.js';
import { showHome } from '../store/dashboard.js';
import { loadDevices } from '../store/devices.js';
import { openNewChannel } from '../store/modal.js';

const TOTAL = 4;

function ProgressBar({ step }) {
    return (
        <div class="setup-progress">
            {Array.from({ length: TOTAL }, (_, i) => (
                <div key={i} class={`setup-seg${i < step ? ' setup-seg-done' : ''}`} />
            ))}
        </div>
    );
}

function Step1() {
    return (
        <div class="setup-step">
            <h2 class="setup-step-title">Install the Leadout datafield</h2>
            <p class="setup-step-desc">
                Leadout runs as a Connect IQ data field on your Garmin watch. Install it from the Garmin app store — you can do this from your phone or computer.
            </p>
            <a
                class="btn-primary setup-store-link"
                href="https://apps.garmin.com/en-US/apps/d2faec2e-7e7c-4efb-b722-08ef0e5c28a3"
                target="_blank"
                rel="noopener noreferrer"
            >
                Open in Garmin Connect IQ Store →
            </a>
            <p class="setup-hint">You can also search for "Leadout" in the Connect IQ app on your phone.</p>
        </div>
    );
}

function Step2() {
    return (
        <div class="setup-step">
            <h2 class="setup-step-title">Add Leadout to your activity</h2>
            <p class="setup-step-desc">
                On your watch, add Leadout as a data field on your chosen activity — for example, Run.
            </p>
            <ol class="setup-instructions">
                <li>Settings</li>
                <li>Activities &amp; Apps</li>
                <li>Your activity (e.g. <em>Run</em>)</li>
                <li>Run Settings</li>
                <li>Data Screens</li>
                <li>Scroll down to <strong>Add New</strong></li>
                <li>Custom Data</li>
                <li>Choose the <strong>single field layout</strong> (first option)</li>
                <li>Connect IQ Fields</li>
                <li>Leadout Datafield</li>
            </ol>
        </div>
    );
}

function Step3({ onComplete }) {
    const [code, setCode] = useState('');
    const [error, setError] = useState(null);
    const [done, setDone] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    async function submit(e) {
        e.preventDefault();
        const clean = code.trim().toUpperCase();
        if (!clean) return;
        setSubmitting(true);
        setError(null);
        try {
            await participantApi.registerDevice(accountId.value, clean);
            await loadDevices();
            setDone(true);
            onComplete();
        } catch (err) {
            setError(err.message === 'device_code already registered'
                ? 'This device code is already registered to an account.'
                : err.message);
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div class="setup-step">
            <h2 class="setup-step-title">Register your watch</h2>
            <p class="setup-step-desc">
                Start a run on your watch and scroll to the Leadout data field — it shows a short device code. Enter it below to link your watch to your account.
            </p>
            {done ? (
                <div class="setup-registered">
                    <span class="setup-check">✓</span>
                    Watch registered! Taking you to the next step…
                </div>
            ) : (
                <form class="setup-code-form" onSubmit={submit}>
                    <input
                        class="device-code-input"
                        value={code}
                        onInput={e => setCode(e.target.value.toUpperCase())}
                        placeholder="e.g. A1B2C3"
                        maxLength={16}
                        autoCapitalize="characters"
                        spellCheck={false}
                    />
                    <button type="submit" class="btn-primary" disabled={submitting || !code.trim()}>
                        {submitting ? 'Registering…' : 'Register'}
                    </button>
                    {error && <p class="error">{error}</p>}
                </form>
            )}
        </div>
    );
}

function Step4() {
    return (
        <div class="setup-step">
            <h2 class="setup-step-title">Get connected</h2>
            <p class="setup-step-desc">Are you joining someone else's sessions, or running your own?</p>
            <div class="setup-role-cards">
                <div class="setup-role-card">
                    <h3>Joining a session</h3>
                    <p>
                        Ask your instructor for their channel link. Open it on your phone and sign in —
                        your watch will sync programmes automatically before each session.
                    </p>
                </div>
                <div class="setup-role-card">
                    <h3>Running a session</h3>
                    <p>
                        Create a channel to start publishing training programmes for your group.
                        Share the channel link with participants so their watches sync automatically.
                    </p>
                    <button class="btn-primary" onClick={openNewChannel}>Create a channel</button>
                </div>
            </div>
        </div>
    );
}

export function SetupPage() {
    const [step, setStep] = useState(1);

    function next() { setStep(s => Math.min(s + 1, TOTAL)); }
    function back() { setStep(s => Math.max(s - 1, 1)); }

    return (
        <div class="main-content setup-page">
            <ProgressBar step={step} />
            <div class="setup-body">
                {step === 1 && <Step1 />}
                {step === 2 && <Step2 />}
                {step === 3 && <Step3 onComplete={next} />}
                {step === 4 && <Step4 />}
            </div>
            <div class="setup-nav">
                <button class="btn-ghost" onClick={back} disabled={step === 1}>Back</button>
                <span class="setup-step-count">Step {step} of {TOTAL}</span>
                {step < TOTAL
                    ? <button class="btn-primary" onClick={next}>Next</button>
                    : <button class="btn-primary" onClick={showHome}>Done</button>
                }
            </div>
        </div>
    );
}
