export function MakingProgrammesPage() {
    return (
        <div class="hiw-page">
            <div class="hiw-content">
                <a class="hiw-back" href="/">← Leadout</a>
                <h1>Making programmes</h1>
                <p class="hiw-intro">
                    A programme is a training session to be run on a particular day.
                    The programme has a sequence of blocks, which break up the session into parts.
                </p>

                <p class="mp-prose">
                    A block is composed of segments.
                    Each segment has a name and an <em>exit clause</em> —
                    the condition that ends it and moves everyone automatically on to the next. Mix any combination freely;
                    there are no restrictions on order or number.
                    When the last segment in the block is completed, everyone's watch will wait at the start of the next block.
                </p>

                <p class="mp-prose">
                    Watches sit on a <strong>WAITING</strong> screen until the lap button is pressed.
                    There is no server coordination — the synchronisation is entirely in the shared
                    moment of the button press. The instructor counts down aloud, everyone presses
                    lap at the same instant, and all watches begin the first segment together.
                </p>


                <div class="hiw-phase-label">Starting the block</div>

                <div class="hiw-sync-banner">
                    <span class="hiw-countdown">3 — 2 — 1 — go</span>
                    <span class="hiw-sync-sub">Everyone presses <strong>lap</strong> simultaneously</span>
                </div>


                <div class="hiw-phase-label">The four segment types</div>

                <p class="mp-prose">
                    Think of each segment as having two parts: what it's <em>called</em> (shown on the watch
                    during that segment - e.g. "Fast", "Slow", "Steady") its <em>exit clause</em> — the condition that triggers
                    the vibration alert and advances to the next segment. You can optionally suggest a target pace - if you do, it's shown on the screen.
                </p>

                <div class="mp-seg-grid">

                    <div class="mp-seg-card">
                        <div class="mp-seg-card-header mp-seg-time">
                            <span class="mp-seg-icon">⏱</span>
                            <strong>Time</strong>
                        </div>
                        <div class="mp-seg-card-body">
                            <div class="mp-exit-clause">
                                <span class="mp-exit-label">Exit clause</span>
                                <span class="mp-exit-text">Timer reaches zero</span>
                            </div>
                            <p>
                                The simplest type. Set a duration and a name — the watch counts
                                down and alerts when time is up. Good for warm-ups, recovery
                                intervals, and any session where distance doesn't matter.
                            </p>
                            <div class="mp-screenshot-placeholder">screenshot</div>
                        </div>
                    </div>

                    <div class="mp-seg-card">
                        <div class="mp-seg-card-header mp-seg-distance">
                            <span class="mp-seg-icon">📏</span>
                            <strong>Distance</strong>
                        </div>
                        <div class="mp-seg-card-body">
                            <div class="mp-exit-clause">
                                <span class="mp-exit-label">Exit clause</span>
                                <span class="mp-exit-text">GPS distance reached</span>
                            </div>
                            <p>
                                The segment ends once each participant has covered the set distance
                                from where they were when it started. Works well for track sessions
                                and routes where everyone takes the same path.
                            </p>
                            <div class="mp-screenshot-placeholder">screenshot</div>
                        </div>
                    </div>

                    <div class="mp-seg-card">
                        <div class="mp-seg-card-header mp-seg-location">
                            <span class="mp-seg-icon">📍</span>
                            <strong>Finish line</strong>
                        </div>
                        <div class="mp-seg-card-body">
                            <div class="mp-exit-clause">
                                <span class="mp-exit-label">Exit clause</span>
                                <span class="mp-exit-text">Cross a GPS line</span>
                            </div>
                            <p>
                                Draw a finish line on the map. Each
                                participant's watch alerts the moment they cross it —
                                useful for "fast to the park gate" or "to the end of the road".
                            </p>
                            <div class="mp-screenshot-placeholder">screenshot</div>
                        </div>
                    </div>

                    <div class="mp-seg-card">
                        <div class="mp-seg-card-header mp-seg-pace">
                            <span class="mp-seg-icon">⚡</span>
                            <strong>Repeat</strong>
                        </div>
                        <div class="mp-seg-card-body">
                            <div class="mp-exit-clause">
                                <span class="mp-exit-label">Exit clause</span>
                                <span class="mp-exit-text">Repetitions / duration / distance</span>
                            </div>
                            <p>
                                Segments can be repeated, allowing you to build the programme more easily.
                                There are three kinds:
                                <div style="padding-left: 2em;">
                                    <div>Repetitions - repeat <em>n</em> times</div>
                                    <div>Duration - repeat until <em>n</em> minutes has elapsed</div>
                                    <div>Distance - repeat until <em>n</em> metres have been covered</div>
                                </div>
                            </p>
                            <div class="mp-screenshot-placeholder">screenshot</div>
                        </div>
                    </div>

                </div>

                <div class="hiw-phase-label">Sharing with participants</div>

                <p class="mp-prose">
                    Every channel has a permanent link. Share it once — in your club WhatsApp group,
                    by email, wherever — and participants subscribe by tapping it on their phone.
                    Their watches sync automatically from then on; you never need to send the link again.
                </p>

                <div class="mp-share-block">
                    <div class="mp-share-label">Your channel link looks like this</div>
                    <div class="mp-share-url">leadout.oliy.co.uk/join/<span class="mp-share-code">abc-123</span></div>
                    <div class="mp-share-hint">
                        Copy it from the channel page and paste it anywhere — WhatsApp, email, a club website.
                        Anyone who taps it can subscribe.
                    </div>
                </div>

                <div class="mp-screenshot-placeholder mp-screenshot-wide">screenshot — channel page showing the share link</div>

            </div>
        </div>
    );
}
