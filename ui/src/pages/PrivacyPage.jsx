export function PrivacyPage() {
    return (
        <div class="privacy-page">
            <div class="privacy-content">
                <a class="privacy-back" href="/">← Leadout</a>
                <h1>Privacy Policy</h1>
                <p class="privacy-date">Last updated: May 2025</p>
                <p>Leadout is designed to collect as little data as possible. This page explains what we store and why.</p>

                <h2>What we collect</h2>
                <ul>
                    <li>
                        <strong>Instructor accounts:</strong> When you sign in with Google, we receive a stable
                        anonymous identifier (your Google account's "sub" claim). We store this identifier and
                        the time your account was created. We never store your name, email address, profile
                        picture, or any other personal information.
                    </li>
                    <li>
                        <strong>Watch devices:</strong> Each Garmin watch running Leadout generates a random
                        device code on first launch. We store this code so your watch can receive programmes.
                        The device code is not linked to your name or email — only to your anonymous account
                        identifier.
                    </li>
                    <li>
                        <strong>Programmes:</strong> Interval session programmes (segment names, durations,
                        distances) created by instructors. These contain no personal data.
                    </li>
                    <li>
                        <strong>Subscriptions:</strong> Which account identifiers are subscribed to which
                        channels. No personal data beyond the anonymous identifiers above.
                    </li>
                    <li>
                        <strong>Sync timestamps:</strong> When your watch last retrieved programme data, to
                        help instructors see whether programmes have been delivered.
                    </li>
                </ul>

                <h2>What we do not collect</h2>
                <ul>
                    <li>No names, email addresses, or profile information</li>
                    <li>No GPS routes, location data, or workout activity files</li>
                    <li>No health data (heart rate, pace, power)</li>
                    <li>No payment information</li>
                    <li>No analytics or tracking cookies</li>
                </ul>

                <h2>How data is used</h2>
                <p>
                    Data is used solely to operate the service: delivering interval programmes from instructors
                    to participants' watches. We do not sell, share, or use data for advertising.
                </p>

                <h2>Data retention</h2>
                <p>
                    You can remove your watch from the service at any time from your account page. Contact us
                    to request deletion of your account data.
                </p>
            </div>
        </div>
    );
}
