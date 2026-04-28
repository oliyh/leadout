# Garmin Connect IQ Store — Submission Guide

## Overview

Publishing a Connect IQ data field to the Garmin store requires a Garmin Developer account,
a signed `.iq` package, and passing the automated review process. Budget 1–3 weeks for first
approval; updates are faster (usually 2–5 days).

---

## 1. Developer Account

1. Go to [developer.garmin.com](https://developer.garmin.com) and sign in with your Garmin account.
2. Accept the Connect IQ Developer Agreement.
3. No approval step — the account is available immediately.

---

## 2. Build a Release Package

The release package is a signed `.iq` file produced by the Connect IQ SDK.

### Prerequisites

- Connect IQ SDK installed (VS Code extension bundles it, or download from the developer portal)
- `monkeybrains.jar` (part of the SDK) on your `PATH`, or use the VS Code task

### Sign your app

You need a developer key to sign releases. Generate one once and keep it safe:

```bash
cd datafield/leadout-datafield
# Generate a key (first time only — keep developer.der and developer.key)
java -jar /path/to/monkeybrains.jar \
    --generate-key \
    --private-key developer.key \
    --public-key developer.der
```

### Build for all target devices

```bash
java -jar /path/to/monkeybrains.jar \
    --package-app \
    --private-key developer.key \
    --output leadout-datafield.iq \
    manifest.xml
```

Or use the VS Code command palette: **Monkey C: Build for Distribution**.

The output is `leadout-datafield.iq` — this is what you upload to the store.

---

## 3. App Metadata

Prepare the following before opening the submission form:

| Field | Notes |
|---|---|
| App name | "Leadout" |
| Type | Data Field |
| Category | Running (or General) |
| Short description | ≤ 200 chars — shown in search results |
| Long description | Full feature description — Markdown supported |
| Screenshots | At minimum one 390×390 simulator screenshot; more is better |
| Icon | 70×70 PNG, no transparency |
| Changelog | Plain text; what changed in this version |
| Permissions | `Communications`, `Background`, `Attention` — must match `manifest.xml` |
| Min CIQ SDK | Match what's in `manifest.xml` (currently 3.2.0 or similar) |
| Supported devices | Select all or a curated list — the SDK build tells you which compiled |

### Writing a good description

- Lead with the use case: "Run structured interval sessions with your training group — everyone starts simultaneously."
- Explain the setup steps (install → register at leadout.oliy.co.uk → subscribe to a channel).
- Note that a phone is not required during the run.
- Mention supported segment types (time, distance).

---

## 4. Submit via the Developer Portal

1. Go to [apps.garmin.com/developer](https://apps.garmin.com/developer) → **My Apps → Create New App**.
2. Choose **Data Field** as the type.
3. Upload `leadout-datafield.iq`.
4. Fill in all metadata fields.
5. Submit for review.

The review checks:
- App launches without crashing on all declared devices
- Permissions declared in the manifest match actual API usage
- No policy violations (no ads, no data collection beyond what's declared, etc.)

---

## 5. Review Process

- Automated checks run first (usually within hours).
- Human review follows for new submissions: typically 1–2 weeks.
- Rejections come with a reason. Common issues:
  - Crash on a specific device model (test on more simulators before submitting)
  - Missing or incorrect permission declaration
  - Icon or screenshot not meeting size requirements
  - Description too vague or missing setup instructions

Fix the issue and resubmit — resubmissions usually move faster.

---

## 6. After Approval

- The app appears at `apps.garmin.com` and in the Connect Mobile app store.
- Users can install from the store or via a direct link:
  `https://apps.garmin.com/en-US/apps/<your-app-uuid>`
- Update the onboarding instructions on the website to use the store URL rather than a sideload link.

---

## 7. Updates

For subsequent releases:

1. Bump the `version` in `manifest.xml`.
2. Build a new signed `.iq`.
3. Go to your app in the developer portal → **Upload New Version**.
4. Add a changelog entry.
5. Updates are usually approved within 2–5 business days.

---

## Checklist

- [ ] Developer account created at developer.garmin.com
- [ ] `developer.key` and `developer.der` generated and stored safely (outside the repo)
- [ ] App builds cleanly for all target devices (`monkeybrains --package-app`)
- [ ] Tested on simulator for Forerunner 255/265/955, Fenix 7, and at least one small-screen device
- [ ] Icon prepared (70×70 PNG)
- [ ] At least one screenshot from the simulator
- [ ] `manifest.xml` permissions match actual API usage
- [ ] Short description written (≤ 200 chars)
- [ ] Long description written with setup instructions
- [ ] API_BASE in `Utils.mc` points to production server (not localhost)
- [ ] Version number bumped in `manifest.xml`
- [ ] `.iq` package uploaded to developer portal
