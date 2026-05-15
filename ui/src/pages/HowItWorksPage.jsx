export function HowItWorksPage() {
    return (
        <div class="hiw-page">
            <div class="hiw-content">
                <a class="hiw-back" href="/">← Leadout</a>
                <h1>How it works</h1>
                <p class="hiw-intro">Build and share interval sessions. Participants' watches sync automatically — everyone starts together.</p>

                <div class="hiw-col-headers">
                    <div class="hiw-col-header hiw-col-header-instructor">Instructor</div>
                    <div></div>
                    <div class="hiw-col-header hiw-col-header-participant">Participants</div>
                </div>

                <div class="hiw-phase-label">One-time setup</div>

                <div class="hiw-grid">
                    <div class="hiw-node hiw-node-instructor">
                        <span class="hiw-num">1</span>
                        <div class="hiw-node-body">
                            <strong>Create a channel</strong>
                            <span>Name it — get a permanent shareable link</span>
                        </div>
                    </div>
                    <div class="hiw-h-arrow"></div>
                    <div class="hiw-node hiw-node-participant">
                        <span class="hiw-num">2</span>
                        <div class="hiw-node-body">
                            <strong>Subscribe</strong>
                            <span>Tap the link to subscribe</span>
                        </div>
                    </div>
                </div>

                <div class="hiw-phase-label">Each session</div>

                <div class="hiw-grid">
                    <div class="hiw-node hiw-node-instructor">
                        <span class="hiw-num">3</span>
                        <div class="hiw-node-body">
                            <strong>Build programme</strong>
                            <div class="hiw-segs">
                                <span class="hiw-seg hiw-seg-easy">Warm-up · 5m</span>
                                <span class="hiw-seg hiw-seg-hard">Fast · 2m</span>
                                <span class="hiw-seg hiw-seg-easy">Easy · 1m</span>
                                <span class="hiw-seg-more">×6</span>
                            </div>
                        </div>
                    </div>
                    <div class="hiw-h-arrow"></div>
                    <div class="hiw-node hiw-node-participant">
                        <span class="hiw-num">4</span>
                        <div class="hiw-node-body">
                            <strong>Watch syncs overnight</strong>
                            <span>No setup needed on the day</span>
                        </div>
                    </div>
                </div>

                <div class="hiw-phase-label">Session day</div>

                <div class="hiw-node hiw-node-both hiw-node-center">
                    <span class="hiw-num">5</span>
                    <div class="hiw-node-body">
                        <strong>Open Leadout</strong>
                        <span>Watch shows "WAITING"</span>
                    </div>
                </div>

                <div class="hiw-v-arrow-center"></div>

                <div class="hiw-sync-banner">
                    <span class="hiw-countdown">3 — 2 — 1 — go</span>
                    <span class="hiw-sync-sub">Everyone presses <strong>lap</strong> simultaneously</span>
                </div>

                <div class="hiw-node hiw-node-success hiw-node-both hiw-node-center">
                    <span class="hiw-check">✓</span>
                    <div class="hiw-node-body">
                        <strong>All watches start together</strong>
                        <span>Vibration alert at every transition</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
