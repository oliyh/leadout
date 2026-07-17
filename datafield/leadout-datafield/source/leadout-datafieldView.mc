import Toybox.Activity;
import Toybox.Application;
import Toybox.Attention;
import Toybox.Communications;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Position;
import Toybox.System;
import Toybox.WatchUi;

class leadout_datafieldView extends WatchUi.DataField {

    // ── State ─────────────────────────────────────────────────────────────

    enum SessionState {
        STATE_SYNCING,           // has token, no programme data yet — awaiting sync
        STATE_UNREGISTERED,      // device not registered — show device code
        STATE_NO_SUBSCRIPTIONS,  // synced OK but account has no channel subscriptions
        STATE_NO_PROGRAMME,      // synced OK, subscribed, but no upcoming programme
        STATE_UPCOMING,          // programme loaded but scheduled for a future date
        STATE_WAITING,           // programme loaded for today — lap press starts the next block
        STATE_ACTIVE,            // running through segments in the current block
        STATE_COMPLETE           // all blocks done
    }

    // mState is null on a brand-new object (no inline initialiser) and is used as
    // the first-init sentinel in initialize(). SessionState? allows the null check.
    hidden var mState as SessionState?;
    hidden var mFetchFailed as Boolean = false;
    hidden var mDeviceCode as String = "";
    hidden var mCurrentBlock as Number = 0;
    hidden var mCurrentSegment as Number = 0;
    hidden var mSegmentStartMs as Number = 0;
    hidden var mProgrammeName as String = "";
    hidden var mProgrammeDate as String = "";
    hidden var mProgrammeId as String = "";
    hidden var mBlocks as Array<Dictionary> = [] as Array<Dictionary>;
    hidden var mBlockNames as Array<String> = [] as Array<String>;  // block names for pre-session display
    hidden var mCurrentPaceSec as Number = 0;          // live pace in sec/km, 0 = no signal
    hidden var mSegmentStartDistM as Float = -1.0f;    // distance at segment start, -1 = uncaptured
    hidden var mElapsedDistM as Float = 0.0f;          // latest elapsed distance from Activity.Info
    hidden var mPolling as Boolean = false;             // registration poll in flight
    hidden var mLastPollMs as Number = 0;              // last registration poll timestamp
    hidden var mLastErrorCode as Number = 0;           // HTTP code from last failed sync
    hidden var mLastErrorMsg as String = "";           // server error string from last failed sync
    hidden var mSessionStartMs as Number = 0;          // timer when first block started
    hidden var mSessionEndMs as Number = 0;            // timer when STATE_COMPLETE reached
    hidden var mSessionStartDistM as Float = 0.0f;    // distance at session start
    hidden var mIsOldSdk as Boolean = false;           // cached isOldSdk() result

    // Repeat-loop state. Set when a block with a repeat segment begins, cleared
    // on block end or when the repeat exits. mRepeatStartIndex = -1 means not in a group.
    hidden var mRepeatStartIndex as Number = -1;   // first segment index of the current group
    hidden var mRepeatStartMs as Number = 0;       // getTimer() when the group began
    hidden var mRepeatStartDistM as Float = 0.0f;  // elapsedDistance when the group began
    hidden var mCurrentRep as Number = 0;          // 1-based rep counter (which rep is running)

    // GPS position tracking for line-crossing detection.
    // mPrevLat = -999.0 signals "no prior fix available".
    // Reset to -999.0 on each block start (LAP press) to prevent a stale position
    // from forming an erroneous movement vector into the first crossing check.
    hidden var mPrevLat as Double = -999.0d;
    hidden var mPrevLng as Double = 0.0d;
    hidden var mWarningCount as Number = 0;  // warning beeps fired for current segment: time segments count up (one per second, final 3s); distance/line segments latch at 1 (single beep, final 15m)
    hidden var mPauseStartMs as Number = 0;       // System.getTimer() at last onTimerPause; 0 when not paused

    // Track whether this data field is the currently visible screen panel.
    // onTimerLap() fires on ALL data fields regardless of visibility; this flag
    // prevents a lap press on another screen (e.g. a TrainingPeaks workout) from
    // accidentally starting or interacting with Leadout.
    hidden var mIsVisible as Boolean = false;

    function initialize() {
        DataField.initialize();

        // mState is null only on a brand-new object (no default value in the declaration).
        // If it already has a value, initialize() has already run and all fields are valid
        // — bail out to preserve any live session state.
        if (mState != null) { return; }

        mState = STATE_SYNCING;
        mFetchFailed = false;
        mDeviceCode = "";
        mCurrentBlock = 0;
        mCurrentSegment = 0;
        mSegmentStartMs = 0;
        mBlocks = [] as Array<Dictionary>;
        mBlockNames = [] as Array<String>;
        mProgrammeName = "";
        mProgrammeDate = "";
        mProgrammeId = "";
        mCurrentPaceSec = 0;
        mSegmentStartDistM = -1.0f;
        mElapsedDistM = 0.0f;
        mPolling = false;
        mLastPollMs = 0;
        mLastErrorCode = 0;
        mLastErrorMsg = "";
        mSessionStartMs = 0;
        mSessionEndMs = 0;
        mSessionStartDistM = 0.0f;
        mIsOldSdk = isOldSdk();
        mRepeatStartIndex = -1;
        mRepeatStartMs = 0;
        mRepeatStartDistM = 0.0f;
        mCurrentRep = 0;
        mPrevLat = -999.0d;
        mPrevLng = 0.0d;
        mWarningCount = 0;
        mPauseStartMs = 0;

        // Load programme header only — segments deferred until session start.
        var cached = Application.Storage.getValue("programme");
        if (cached instanceof Dictionary) {
            loadProgrammeHeader(cached as Dictionary);
        }
    }

    // No XML layout — everything drawn manually in onUpdate.
    function onLayout(dc as Dc) as Void {}

    // ── External API ──────────────────────────────────────────────────────

    function setProgramme(data as Dictionary) as Void {
        loadProgrammeHeader(data);
        WatchUi.requestUpdate();
    }

    function setFetchFailed(code as Number, msg as String) as Void {
        mLastErrorCode = code;
        mLastErrorMsg = msg;
        if (mState == STATE_SYNCING) {
            mFetchFailed = true;
            WatchUi.requestUpdate();
        }
    }

    function setRegistrationRequired(deviceCode as String) as Void {
        var firstTime = mState != STATE_UNREGISTERED;
        mDeviceCode = deviceCode;
        mState = STATE_UNREGISTERED;
        mLastPollMs = 0;
        if (firstTime && !mIsOldSdk && (Communications has :openWebPage)) {
            Communications.openWebPage(API_BASE + "/?device_code=" + deviceCode, null, null);
        }
        WatchUi.requestUpdate();
    }

    function setDeviceCode(deviceCode as String) as Void {
        mDeviceCode = deviceCode;
    }

    function setNoSubscriptions() as Void {
        if (sessionInProgress()) { return; }
        mState = STATE_NO_SUBSCRIPTIONS;
        WatchUi.requestUpdate();
    }

    function setNoProgramme() as Void {
        if (sessionInProgress()) { return; }
        mState = STATE_NO_PROGRAMME;
        WatchUi.requestUpdate();
    }

    // Clears all per-session runtime state: block/segment position, segment and
    // session timers, pause, GPS tracking, warning flag, and the repeat group.
    // Shared by reset() and resetToStart(); mirrors the session fields in initialize().
    hidden function clearSessionState() as Void {
        mCurrentBlock      = 0;
        mCurrentSegment    = 0;
        mBlocks            = [] as Array<Dictionary>;
        mSegmentStartMs    = 0;
        mSegmentStartDistM = -1.0f;
        mSessionStartMs    = 0;
        mSessionEndMs      = 0;
        mSessionStartDistM = 0.0f;
        mPauseStartMs      = 0;
        mWarningCount      = 0;
        mPrevLat           = -999.0d;
        mPrevLng           = 0.0d;
        clearRepeatState();
    }

    // Full wipe back to STATE_SYNCING — discards the loaded programme and error
    // state. Used by the settings reset action, which also clears Storage, so it
    // does not reload from cache.
    function reset() as Void {
        clearSessionState();
        mState = STATE_SYNCING;
        mFetchFailed = false;
        mLastErrorCode = 0;
        mLastErrorMsg = "";
        mBlockNames = [] as Array<String>;
        mProgrammeName = "";
        mProgrammeDate = "";
        mProgrammeId = "";
        WatchUi.requestUpdate();
    }

    // ── Input ─────────────────────────────────────────────────────────────

    function onShow() as Void {
        mIsVisible = true;
    }

    function onHide() as Void {
        mIsVisible = false;
    }

    function onTimerLap() as Void {
        if (!mIsVisible) {
            return;
        }
        if (mState == STATE_UPCOMING) {
            return;
        }
        if (mState == STATE_UNREGISTERED) {
            // LAP re-opens the site in case the user dismissed it.
            if (!mIsOldSdk && (Communications has :openWebPage)) {
                Communications.openWebPage(API_BASE + "/?device_code=" + mDeviceCode, null, null);
            }
            return;
        }
        if (mState == STATE_WAITING) {
            // Segments are loaded lazily on first LAP press to keep heap free during idle.
            if (mBlocks.size() == 0) {
                var cached = Application.Storage.getValue("programme");
                if (cached instanceof Dictionary) {
                    loadProgrammeSegments(cached as Dictionary);
                }
                if (mBlocks.size() == 0) { return; }
            }
            mState = STATE_ACTIVE;
            mCurrentSegment = 0;
            mSegmentStartMs = System.getTimer();
            mSegmentStartDistM = -1.0f;  // will be captured on first compute()
            mWarningCount = 0;
            mPrevLat = -999.0d;          // invalidate so first GPS tick after LAP press sets a fresh prev
            // Eagerly init repeat state if this block contains a repeat segment,
            // so the progress header is visible from the very first rep.
            initRepeatForBlock(currentSegments());
            if (mCurrentBlock == 0 && !mDeviceCode.equals("") && !mProgrammeId.equals("")) {
                mSessionStartMs = System.getTimer();
                mSessionStartDistM = mElapsedDistM;
                Application.Storage.setValue("pending_participation_id", mProgrammeId);
                if (!mIsOldSdk) { recordParticipation(); }
            }
        }
    }

    // Freeze the countdown on the manual Stop button only (onTimerStop/onTimerStart).
    // We deliberately do NOT hook onTimerPause/onTimerResume: those fire from Auto
    // Pause, which is speed-driven — a participant standing still during a "recovery"
    // segment could trip it, and the interval countdown must keep running through
    // recovery. Only a deliberate Stop press should halt the session.
    function onTimerStop() as Void {
        freezeTimers();
    }

    function onTimerStart() as Void {
        unfreezeTimers();
    }

    // Activity ended (saved or discarded) — return to the start of the programme
    // so a freshly started activity shows the session from the beginning rather
    // than the stale state of the View instance (which may not be destroyed).
    function onTimerReset() as Void {
        resetToStart();
    }

    // Freeze the countdown at the current instant. Idempotent: a repeat Stop
    // event keeps the original stop timestamp so the resume adjustment spans the
    // whole stoppage.
    hidden function freezeTimers() as Void {
        if (mPauseStartMs == 0) {
            mPauseStartMs = System.getTimer();
        }
    }

    // Resume after a freeze, shifting the segment/session start markers forward
    // by the paused duration so the countdown continues from where it stopped.
    hidden function unfreezeTimers() as Void {
        if (mPauseStartMs > 0) {
            var pauseDuration = System.getTimer() - mPauseStartMs;
            if (mState == STATE_ACTIVE) {
                mSegmentStartMs += pauseDuration;
                if (mRepeatStartIndex >= 0) {
                    mRepeatStartMs += pauseDuration;
                }
            }
            if (mSessionStartMs > 0) {
                mSessionStartMs += pauseDuration;
            }
            mPauseStartMs = 0;
        }
    }

    // Returns to the start of the loaded programme: block 0, no active segment,
    // all session/pause timers cleared. Segments are freed and reloaded lazily
    // on the next LAP press. Unlike reset(), keeps the same programme by reloading
    // its header from cache.
    hidden function resetToStart() as Void {
        clearSessionState();
        // Neutralise mState so loadProgrammeHeader's sessionInProgress() guard passes,
        // then reload the header from cache → block 0, STATE_WAITING/UPCOMING.
        mState = STATE_SYNCING;
        var cached = Application.Storage.getValue("programme");
        if (cached instanceof Dictionary) {
            loadProgrammeHeader(cached as Dictionary);
        }
        WatchUi.requestUpdate();
    }

    // ── Logic ─────────────────────────────────────────────────────────────

    // Returns the current timer value, frozen at the pause instant while paused.
    // All elapsed-time calculations should use this instead of System.getTimer()
    // directly so that countdowns freeze during an activity pause.
    hidden function effectiveNow() as Number {
        return (mPauseStartMs > 0) ? mPauseStartMs : System.getTimer();
    }

    function compute(info as Activity.Info) as Void {
        // Update live pace from GPS speed (m/s → sec/km)
        if (info.currentSpeed instanceof Float) {
            var spd = info.currentSpeed as Float;
            mCurrentPaceSec = (spd > 0.5f) ? (1000.0f / spd).toNumber() : 0;
        }

        // Update elapsed distance for distance-segment transitions
        if (info.elapsedDistance instanceof Float) {
            mElapsedDistM = info.elapsedDistance as Float;
            if (mSegmentStartDistM < 0.0f) {
                mSegmentStartDistM = mElapsedDistM;
            }
        }

        // Capture GPS position for line-crossing detection.
        // Save previous position as locals first, then advance the stored pointer.
        // This way the crossing check always sees (last tick → this tick) as the movement vector.
        var prevLat = mPrevLat;
        var prevLng = mPrevLng;
        if ((info has :currentLocation) && info.currentLocation != null) {
            var deg = (info.currentLocation as Position.Location).toDegrees();
            mPrevLat = deg[0] as Double;
            mPrevLng = deg[1] as Double;
        }

        // While unregistered, poll the token endpoint every 10 s.
        if (mState == STATE_UNREGISTERED && !mPolling && !mIsOldSdk) {
            var now = System.getTimer();
            if (now - mLastPollMs > 10000) {
                mLastPollMs = now;
                mPolling = true;
                makeTokenRequest(mDeviceCode, method(:onTokenPoll));
            }
        }

        if (mState != STATE_ACTIVE) {
            return;
        }

        // Don't advance segments while the activity is paused.
        if (mPauseStartMs > 0) {
            return;
        }

        var segments = currentSegments();
        var seg = segments[mCurrentSegment] as Array;
        var kind = seg[SEG_KIND] as Number;

        // Guard: repeat markers should never be the current segment, but skip if they are.
        if (kind == KIND_REPEAT) { return; }

        // ── Continuous time/distance exit check (can fire mid-segment) ────────
        if (mRepeatStartIndex >= 0) {
            var repSeg = currentRepeatMarkerSeg(segments);
            if (repSeg != null) {
                var repExitType = repSeg[REP_EXIT] as Number;
                if (repExitType != EXIT_COUNT) {
                    var elapsedMs = effectiveNow() - mRepeatStartMs;
                    var coveredM  = mElapsedDistM - mRepeatStartDistM;
                    if (shouldExitRepeat(repSeg, mCurrentRep, elapsedMs, coveredM)) {
                        doRepeatExit(segments, currentRepeatMarkerIdx(segments));
                        return;
                    }
                }
            }
        }

        // ── Normal segment completion check ───────────────────────────────────
        var advance = false;
        if (kind == KIND_DISTANCE) {
            var distTarget = seg[SEG_DISTANCE] as Float;
            if (mSegmentStartDistM >= 0.0f) {
                var distDone = mElapsedDistM - mSegmentStartDistM;
                advance = distDone >= distTarget;
                if (!advance) {
                    // Single latched warning beep on entering the final stretch — unlike
                    // the time-based countdown, GPS distance can jitter back and forth
                    // near the threshold, so mWarningCount just flags "already fired".
                    var distanceRemaining = distTarget - distDone;
                    if (inFinalStretch(distanceRemaining, SEGMENT_WARNING_DISTANCE_M) && mWarningCount == 0) {
                        mWarningCount = 1;
                        alertWarning();
                    }
                }
            }
        } else if (kind == KIND_LINE) {
            // Require a valid movement vector and > 5 s since segment/block start.
            // The debounce prevents false triggers when standing on the line at LAP press
            // or from GPS jitter immediately after a crossing fires.
            if (prevLat > -998.0d && mPrevLat > -998.0d) {
                if (effectiveNow() - mSegmentStartMs > 5000) {
                    advance = lineCrossingCheck(
                        prevLat, prevLng, mPrevLat, mPrevLng,
                        (seg[LINE_P1LAT] as Float).toDouble(),
                        (seg[LINE_P1LNG] as Float).toDouble(),
                        (seg[LINE_P2LAT] as Float).toDouble(),
                        (seg[LINE_P2LNG] as Float).toDouble()
                    );
                }
                if (!advance && mWarningCount == 0) {
                    var midLat = ((seg[LINE_P1LAT] as Float).toDouble() + (seg[LINE_P2LAT] as Float).toDouble()) / 2.0d;
                    var midLng = ((seg[LINE_P1LNG] as Float).toDouble() + (seg[LINE_P2LNG] as Float).toDouble()) / 2.0d;
                    var distToLineM = distanceToPointM(mPrevLat, mPrevLng, midLat, midLng);
                    if (inFinalStretch(distToLineM, SEGMENT_WARNING_DISTANCE_M)) {
                        mWarningCount = 1;
                        alertWarning();
                    }
                }
            }
        } else {
            var duration = seg[SEG_DURATION] as Number;
            var elapsedSecs = (effectiveNow() - mSegmentStartMs) / 1000;
            advance = elapsedSecs >= duration;
            if (!advance) {
                var remaining = duration - elapsedSecs;
                // Fire one beep per second for the last SEGMENT_WARNING_SECS seconds.
                // mWarningCount tracks how many beeps have fired; a new beep is
                // due whenever remaining drops to a value we haven't beeped yet.
                if (inFinalCountdown(remaining, SEGMENT_WARNING_SECS) && (SEGMENT_WARNING_SECS - remaining) >= mWarningCount) {
                    mWarningCount += 1;
                    alertWarning();
                }
            }
        }

        if (advance) {
            doAdvance(segments);
        }
    }

    // ── Repeat helpers ────────────────────────────────────────────────────

    // Called when a block starts. Scans for the first repeat segment; if found,
    // sets up group state so the header is visible from rep 1.
    hidden function initRepeatForBlock(segments as Array) as Void {
        for (var i = 0; i < segments.size(); i++) {
            if ((segments[i] as Array)[SEG_KIND] as Number == KIND_REPEAT) {
                mRepeatStartIndex = 0;
                mRepeatStartMs    = System.getTimer();
                mRepeatStartDistM = mElapsedDistM;
                mCurrentRep       = 1;
                return;
            }
        }
        mRepeatStartIndex = -1;
        mRepeatStartMs    = 0;
        mRepeatStartDistM = 0.0f;
        mCurrentRep       = 0;
    }

    hidden function clearRepeatState() as Void {
        mRepeatStartIndex = -1;
        mRepeatStartMs    = 0;
        mRepeatStartDistM = 0.0f;
        mCurrentRep       = 0;
    }

    hidden function currentRepeatMarkerSeg(segments as Array) as Array? {
        for (var i = mRepeatStartIndex; i < segments.size(); i++) {
            var s = segments[i] as Array;
            if (s[SEG_KIND] as Number == KIND_REPEAT) { return s; }
        }
        return null;
    }

    hidden function currentRepeatMarkerIdx(segments as Array) as Number {
        for (var i = mRepeatStartIndex; i < segments.size(); i++) {
            if ((segments[i] as Array)[SEG_KIND] as Number == KIND_REPEAT) { return i; }
        }
        return -1;
    }

    hidden function doAdvance(segments as Array) as Void {
        var nextIdx = mCurrentSegment + 1;

        if (nextIdx >= segments.size()) {
            doBlockOrSessionEnd();
            return;
        }

        var nextSeg = segments[nextIdx] as Array;
        if (nextSeg[SEG_KIND] as Number == KIND_REPEAT) {
            var elapsedMs = System.getTimer() - mRepeatStartMs;
            var coveredM  = mElapsedDistM - mRepeatStartDistM;
            if (shouldExitRepeat(nextSeg, mCurrentRep, elapsedMs, coveredM)) {
                doRepeatExit(segments, nextIdx);
            } else {
                mCurrentRep    += 1;
                mCurrentSegment = mRepeatStartIndex;
                mSegmentStartMs = System.getTimer();
                mSegmentStartDistM = mElapsedDistM;
                mWarningCount = 0;
                alertSegment();
            }
        } else {
            mCurrentSegment    = nextIdx;
            mSegmentStartMs    = System.getTimer();
            mSegmentStartDistM = mElapsedDistM;
            mWarningCount = 0;
            alertSegment();
        }
    }

    // Called when the repeat exit condition is met. Advances past the repeat
    // marker and initialises the next group if another repeat follows.
    hidden function doRepeatExit(segments as Array, repeatIdx as Number) as Void {
        var afterRepeat = repeatIdx + 1;

        // Look for a subsequent repeat group in this block.
        var nextRepeatIdx = -1;
        for (var i = afterRepeat; i < segments.size(); i++) {
            if ((segments[i] as Array)[SEG_KIND] as Number == KIND_REPEAT) {
                nextRepeatIdx = i;
                break;
            }
        }
        if (nextRepeatIdx >= 0) {
            mRepeatStartIndex = afterRepeat;
            mRepeatStartMs    = System.getTimer();
            mRepeatStartDistM = mElapsedDistM;
            mCurrentRep       = 1;
        } else {
            clearRepeatState();
        }

        if (afterRepeat < segments.size()) {
            mCurrentSegment    = afterRepeat;
            mSegmentStartMs    = System.getTimer();
            mSegmentStartDistM = mElapsedDistM;
            mWarningCount = 0;
            alertSegment();
        } else {
            doBlockOrSessionEnd();
        }
    }

    hidden function doBlockOrSessionEnd() as Void {
        clearRepeatState();
        if (mCurrentBlock < mBlocks.size() - 1) {
            mCurrentBlock  += 1;
            mCurrentSegment = 0;
            mState          = STATE_WAITING;
            alertBlockComplete();
        } else {
            mSessionEndMs = System.getTimer();
            mState        = STATE_COMPLETE;
            alertSessionComplete();
        }
    }

    // ── Session guard ─────────────────────────────────────────────────────

    // True while a Leadout session is in progress or finished on this activity:
    // actively running a segment (STATE_ACTIVE), waiting between blocks
    // (STATE_WAITING at block > 0), or done (STATE_COMPLETE). Used by
    // loadProgrammeHeader and the sync state setters to prevent a background sync
    // result from silently resetting an in-progress session back to STATE_WAITING —
    // which would let a stray autolap (e.g. on the run home) restart it. Only
    // onTimerReset()/resetToStart() (a genuine new activity) clears STATE_COMPLETE.
    hidden function sessionInProgress() as Boolean {
        return mState == STATE_ACTIVE ||
               (mState == STATE_WAITING && mCurrentBlock > 0) ||
               mState == STATE_COMPLETE;
    }

    // ── Programme loading ─────────────────────────────────────────────────

    // Reads programme name, date, id, and block names from the compact Storage format.
    // Clears mBlocks so segments are re-parsed fresh at session start.
    // Called at init, on sync arrival, and after registration completes.
    hidden function loadProgrammeHeader(data as Dictionary) as Void {
        // Don't disrupt a session in progress. Background sync can fire any time,
        // but the instructor won't change the programme while the session is running.
        if (sessionInProgress()) { return; }

        mProgrammeName = (data["n"] instanceof String) ? data["n"] as String : "";
        mProgrammeDate = (data["d"] instanceof String) ? data["d"] as String : "";
        mProgrammeId   = (data["i"] instanceof String) ? data["i"] as String : "";

        mBlockNames = [] as Array<String>;
        var rawBlocks = data["b"];
        if (rawBlocks instanceof Array) {
            var jsonBlocks = rawBlocks as Array<Dictionary>;
            for (var i = 0; i < jsonBlocks.size(); i++) {
                var bname = (jsonBlocks[i] as Dictionary)["n"];
                mBlockNames.add((bname instanceof String) ? bname as String : "");
            }
        }

        // Clear any previously parsed segments — new programme supersedes old session.
        mBlocks = [] as Array<Dictionary>;
        mCurrentBlock = 0;
        mCurrentSegment = 0;
        clearRepeatState();

        if (mProgrammeName.length() > 0) {
            mState = mProgrammeDate.equals(todayDateString()) ? STATE_WAITING : STATE_UPCOMING;
        }
    }

    // Points mBlocks at the compact block array straight from Storage — no expansion
    // to Dictionaries. Each block is {"n" => name, "s" => Array of compact segment
    // arrays}; segments are read positionally (see the layout constants in Config.mc).
    // Aliasing rather than copying is the key heap saving on FR245: the verbose
    // Dictionary-per-segment tree this used to build no longer exists, so the
    // double-allocation peak at LAP press is gone and the resident session footprint
    // is just the compact arrays. Does not change mState/mCurrentBlock/mCurrentSegment.
    hidden function loadProgrammeSegments(data as Dictionary) as Void {
        var rawBlocks = data["b"];
        if (rawBlocks instanceof Array) {
            mBlocks = rawBlocks as Array<Dictionary>;
        }
    }

    // Fire-and-forget POST to /api/sessions/start. No retry on failure.
    hidden function recordParticipation() as Void {
        var watchToken = Application.Storage.getValue("watch_token");
        var headers = { "Content-Type" => "application/json" } as Dictionary<String, String>;
        if (watchToken instanceof String) {
            headers["Authorization"] = "Bearer " + (watchToken as String);
        }
        Communications.makeWebRequest(
            API_BASE + "/api/sessions/start",
            { "device_code" => mDeviceCode, "programme_id" => mProgrammeId },
            {
                :method       => Communications.HTTP_REQUEST_METHOD_POST,
                :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON,
                :headers      => headers
            },
            method(:onParticipationResponse)
        );
    }

    function onParticipationResponse(responseCode as Number, data as Dictionary?) as Void {
    }

    // Callback for the token poll (fired from compute() every 10 s in STATE_UNREGISTERED).
    // 200 { token } → token claimed; persist it and immediately sync to load a programme.
    // 202 → device not yet registered; compute() retries after 10 s.
    // Other (including 410 already-claimed) → leave mPolling=false so compute() retries.
    function onTokenPoll(responseCode as Number, data as Dictionary?) as Void {
        mPolling = false;
        if (responseCode == 200 && data != null) {
            var token = data["token"];
            if (token instanceof String) {
                var t = token as String;
                Application.Storage.setValue("watch_token", t);
                mPolling = true;
                makeSyncRequest(mDeviceCode, t, method(:onRegistrationPoll));
            }
        }
    }

    // Callback for the sync fired immediately after claiming the token.
    // 200 → registered and synced; load programme (or show appropriate empty state).
    // 401 → token was rejected — delegate re-registration to the App.
    // Other → network issue; compute() will retry the token poll after 10 s.
    function onRegistrationPoll(responseCode as Number, data as Dictionary?) as Void {
        mPolling = false;
        if (responseCode == 200 && data != null) {
            var programmes = data["programmes"] as Array<Dictionary>;
            var prog = findNextProgramme(programmes);
            if (prog != null) {
                var compact = compressProgramme(prog as Dictionary);
                Application.Storage.setValue("programme", compact);
                loadProgrammeHeader(compact);
            } else {
                var subCount = data["subscription_count"];
                if (subCount instanceof Number && (subCount as Number) == 0) {
                    mState = STATE_NO_SUBSCRIPTIONS;
                } else {
                    mState = STATE_NO_PROGRAMME;
                }
            }
            WatchUi.requestUpdate();
        } else if (responseCode == 401) {
            getApp().handleAuthFailure();
        }
    }

    // Short low beep — countdown tick for each of the last 3 seconds of a time segment.
    hidden function alertWarning() as Void {
        if (Attention has :playTone) {
            Attention.playTone(Attention.TONE_ALERT_LO);
        }
    }

    // Single short beep + brief vibe — segment within a block changes.
    hidden function alertSegment() as Void {
        if (Attention has :playTone) {
            Attention.playTone(Attention.TONE_LAP);
        }
        if (Attention has :vibrate) {
            Attention.vibrate([new Attention.VibeProfile(100, 250)] as Array<Attention.VibeProfile>);
        }
    }

    // Two beeps + double vibe — block finished, waiting for lap to start next.
    hidden function alertBlockComplete() as Void {
        if (Attention has :playTone) {
            Attention.playTone(Attention.TONE_INTERVAL_ALERT);
        }
        if (Attention has :vibrate) {
            Attention.vibrate([
                new Attention.VibeProfile(100, 300),
                new Attention.VibeProfile(0,   200),
                new Attention.VibeProfile(100, 300)
            ] as Array<Attention.VibeProfile>);
        }
    }

    // Long beep + long vibe — all blocks done.
    hidden function alertSessionComplete() as Void {
        if (Attention has :playTone) {
            Attention.playTone(Attention.TONE_RESET);
        }
        if (Attention has :vibrate) {
            Attention.vibrate([new Attention.VibeProfile(100, 1000)] as Array<Attention.VibeProfile>);
        }
    }

    // Returns the compact segment array for the current block: an Array of
    // positional segment Arrays (see the layout constants in Config.mc).
    hidden function currentSegments() as Array {
        return (mBlocks[mCurrentBlock] as Dictionary)["s"] as Array;
    }

    // Uses mBlocks when the session is active (segments loaded), falls back to
    // mBlockNames (populated from header) when waiting before session start.
    hidden function currentBlockName() as String {
        if (mBlocks.size() > mCurrentBlock) {
            return (mBlocks[mCurrentBlock] as Dictionary)["n"] as String;
        }
        if (mBlockNames.size() > mCurrentBlock) {
            return mBlockNames[mCurrentBlock] as String;
        }
        return "";
    }

    // ── Display ───────────────────────────────────────────────────────────

    function onUpdate(dc as Dc) as Void {
        var bgColor = getBackgroundColor();
        var fgColor = (bgColor == Graphics.COLOR_BLACK)
            ? Graphics.COLOR_WHITE
            : Graphics.COLOR_BLACK;

        dc.setColor(Graphics.COLOR_TRANSPARENT, bgColor);
        dc.clear();
        dc.setColor(fgColor, Graphics.COLOR_TRANSPARENT);

        var cx = dc.getWidth() / 2;
        var cy = dc.getHeight() / 2;

        if (mState == STATE_SYNCING) {
            drawSyncing(dc, cx, cy, fgColor);
        } else if (mState == STATE_UNREGISTERED) {
            drawUnregistered(dc, cx, cy, fgColor);
        } else if (mState == STATE_NO_SUBSCRIPTIONS) {
            drawNoSubscriptions(dc, cx, cy, fgColor);
        } else if (mState == STATE_NO_PROGRAMME) {
            drawNoProgramme(dc, cx, cy, fgColor);
        } else if (mState == STATE_UPCOMING) {
            drawUpcoming(dc, cx, cy, fgColor);
        } else if (mState == STATE_WAITING) {
            drawWaiting(dc, cx, cy, fgColor);
        } else if (mState == STATE_ACTIVE) {
            drawActive(dc, cx, cy, fgColor);
        } else if (mState == STATE_COMPLETE) {
            drawComplete(dc, cx, cy, fgColor);
        }
    }

    hidden function drawSyncing(dc as Dc, cx as Number, cy as Number, fgColor as ColorValue) as Void {
        if (mFetchFailed) {
            dc.drawText(cx, cy - 10, Graphics.FONT_SMALL,
                "No connection",
                Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            var detail = (mLastErrorMsg.length() > 0) ? mLastErrorMsg : ("HTTP " + mLastErrorCode);
            dc.drawText(cx, cy + 20, Graphics.FONT_XTINY,
                detail,
                Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        } else {
            dc.drawText(cx, cy, Graphics.FONT_SMALL,
                "Awaiting sync",
                Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        }
    }

    hidden function drawNoSubscriptions(dc as Dc, cx as Number, cy as Number, fgColor as ColorValue) as Void {
        dc.setColor(fgColor, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, cy - 12, Graphics.FONT_SMALL,
            "No subscriptions",
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, cy + 16, Graphics.FONT_XTINY,
            "Visit leadout to find channels",
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    hidden function drawNoProgramme(dc as Dc, cx as Number, cy as Number, fgColor as ColorValue) as Void {
        dc.setColor(fgColor, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, cy - 12, Graphics.FONT_SMALL,
            "No programme today",
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, cy + 16, Graphics.FONT_XTINY,
            "Check your channel",
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    hidden function drawUpcoming(dc as Dc, cx as Number, cy as Number, fgColor as ColorValue) as Void {
        var h = dc.getHeight();
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, h / 4, Graphics.FONT_XTINY,
            "Next session",
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        dc.setColor(fgColor, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, h / 2 - 14, Graphics.FONT_MEDIUM,
            mProgrammeName,
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, h * 3 / 4, Graphics.FONT_XTINY,
            mProgrammeDate,
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    // Shown when the server says this device_code is not registered.
    // Pressing LAP opens leadout.oliy.co.uk in the paired phone browser.
    hidden function drawUnregistered(dc as Dc, cx as Number, cy as Number, fgColor as ColorValue) as Void {
        var h = dc.getHeight();

        dc.setColor(fgColor, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, h / 4, Graphics.FONT_XTINY,
            "leadout.oliy.co.uk",
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, h / 2 - 24, Graphics.FONT_XTINY,
            "Device code",
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

        dc.setColor(fgColor, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, h / 2 + 14, Graphics.FONT_MEDIUM,
            mDeviceCode,
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, h * 3 / 4 + 10, Graphics.FONT_XTINY,
            "LAP to re-open",
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    hidden function drawWaiting(dc as Dc, cx as Number, cy as Number, fgColor as ColorValue) as Void {
        var h = dc.getHeight();

        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, h / 4 - 28, Graphics.FONT_XTINY,
            "Programme",
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        dc.setColor(fgColor, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, h / 4 + 14, Graphics.FONT_MEDIUM,
            mProgrammeName,
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

        dc.drawText(cx, h / 2, Graphics.FONT_SMALL,
            "Press LAP to start",
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, h * 3 / 4 - 28, Graphics.FONT_XTINY,
            "Next",
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        dc.drawText(cx, h * 3 / 4 + 4, Graphics.FONT_TINY,
            currentBlockName(),
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        dc.setColor(fgColor, Graphics.COLOR_TRANSPARENT);
    }

    hidden function drawActive(dc as Dc, cx as Number, cy as Number, fgColor as ColorValue) as Void {
        var h = dc.getHeight();
        var segments = currentSegments();
        var seg = segments[mCurrentSegment] as Array;
        var segKind = seg[SEG_KIND] as Number;
        var segName = seg[SEG_NAME] as String;
        // pace lives at index 6 on line segments, index 4 otherwise; -1 = no target.
        var targetPace = (segKind == KIND_LINE) ? (seg[LINE_PACE] as Number) : (seg[SEG_PACE] as Number);

        // Time remaining in the current segment; only meaningful when time-based
        // (KIND_DISTANCE/KIND_LINE complete on GPS progress, not a clock).
        var timeRemaining = (segKind != KIND_DISTANCE && segKind != KIND_LINE)
            ? ((seg[SEG_DURATION] as Number) - ((effectiveNow() - mSegmentStartMs) / 1000))
            : -1;

        // Distance remaining for the two GPS-driven kinds. -1.0 sentinel when not
        // applicable, or for a finish line with no GPS fix yet (mPrevLat still -999).
        var distRemaining = -1.0f;
        if (segKind == KIND_DISTANCE) {
            var distDone = (mSegmentStartDistM >= 0.0f) ? (mElapsedDistM - mSegmentStartDistM) : 0.0f;
            distRemaining = (seg[SEG_DISTANCE] as Float) - distDone;
        } else if (segKind == KIND_LINE && mPrevLat > -998.0d) {
            var midLat = ((seg[LINE_P1LAT] as Float).toDouble() + (seg[LINE_P2LAT] as Float).toDouble()) / 2.0d;
            var midLng = ((seg[LINE_P1LNG] as Float).toDouble() + (seg[LINE_P2LNG] as Float).toDouble()) / 2.0d;
            distRemaining = distanceToPointM(mPrevLat, mPrevLng, midLat, midLng);
        }

        // Next display segment — skip repeat markers. Shared by the segment-name
        // countdown preview below and the bottom "Next" panel.
        var nextIdx = nextSegmentIndex(segments, mCurrentSegment);

        // ── Repeat progress header (above segment name) ───────────────────
        if (mRepeatStartIndex >= 0) {
            var repSeg = currentRepeatMarkerSeg(segments);
            if (repSeg != null) {
                var exitType = repSeg[REP_EXIT] as Number;
                var headerText = "";
                if (exitType == EXIT_COUNT) {
                    var total = repSeg[REP_COUNT] as Number;
                    var current = mCurrentRep;
                    if (current > total) { current = total; }
                    headerText = current.format("%d") + "/" + total.format("%d");
                } else if (exitType == EXIT_TIME) {
                    var target = repSeg[REP_DURATION] as Number;
                    var elapsedSecs = (effectiveNow() - mRepeatStartMs) / 1000;
                    var remaining = target - elapsedSecs;
                    if (remaining < 0) { remaining = 0; }
                    headerText = formatDuration(remaining);
                } else {
                    var target = repSeg[REP_DISTANCE] as Float;
                    var covered = mElapsedDistM - mRepeatStartDistM;
                    var remaining = target - covered;
                    if (remaining < 0.0f) { remaining = 0.0f; }
                    headerText = remaining.format("%d") + "m";
                }
                dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
                dc.drawText(cx, h / 8, Graphics.FONT_XTINY,
                    headerText,
                    Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            }
        }

        // ── Segment name — swaps to "Next: X" in the final few seconds so a
        // glance during the warning beeps shows what's coming, not what's ending.
        dc.setColor(fgColor, Graphics.COLOR_TRANSPARENT);
        var nameText = segName;
        if (inFinalCountdown(timeRemaining, SEGMENT_WARNING_SECS) || inFinalStretch(distRemaining, SEGMENT_WARNING_DISTANCE_M)) {
            var previewName = segmentPreviewName(segments, nextIdx, mBlocks, mCurrentBlock);
            if (previewName != null) {
                nameText = "Next: " + previewName;
            }
        }
        dc.drawText(cx, h / 4, Graphics.FONT_MEDIUM,
            nameText,
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

        // ── Main counter (time remaining or distance remaining) ────────────
        if (segKind == KIND_DISTANCE) {
            var distRemainingDisplay = distRemaining;
            if (distRemainingDisplay < 0.0f) { distRemainingDisplay = 0.0f; }
            dc.drawText(cx, h / 2, Graphics.FONT_NUMBER_HOT,
                distRemainingDisplay.format("%d") + "m",
                Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        } else if (segKind == KIND_LINE) {
            // Show metres to the finish-line midpoint when a GPS fix is available.
            // Falls back to "Cross line" when mPrevLat is still the sentinel -999
            // (distRemaining stays at its -1.0 sentinel in that case).
            if (distRemaining >= 0.0f) {
                dc.drawText(cx, h / 2, Graphics.FONT_NUMBER_HOT,
                    distRemaining.format("%d") + "m",
                    Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            } else {
                dc.drawText(cx, h / 2, Graphics.FONT_SMALL,
                    "Cross line",
                    Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            }
        } else {
            var remaining = timeRemaining;
            if (remaining < 0) { remaining = 0; }
            dc.drawText(cx, h / 2, Graphics.FONT_NUMBER_HOT,
                formatDuration(remaining),
                Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        }

        // ── Bottom area: pace (when target set) or next segment ───────────
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        if (targetPace >= 0) {
            // Two-column pace display: Target | Actual
            var leftX  = cx / 2;
            var rightX = cx + cx / 2;
            var labelY = h * 3 / 4 - 28;
            var valueY = h * 3 / 4 + 10;

            dc.drawText(leftX, labelY, Graphics.FONT_XTINY,
                "Target",
                Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            dc.setColor(fgColor, Graphics.COLOR_TRANSPARENT);
            dc.drawText(leftX, valueY, Graphics.FONT_TINY,
                formatDuration(targetPace as Number),
                Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(rightX, labelY, Graphics.FONT_XTINY,
                "Actual",
                Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            var paceOnTarget = isPaceOnTarget(mCurrentPaceSec, targetPace);
            dc.setColor(paceOnTarget ? Graphics.COLOR_GREEN : fgColor, Graphics.COLOR_TRANSPARENT);
            dc.drawText(rightX, valueY, Graphics.FONT_TINY,
                (mCurrentPaceSec > 0) ? formatDuration(mCurrentPaceSec) : "--:--",
                Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        } else {
            if (nextIdx < segments.size()) {
                var next = segments[nextIdx] as Array;
                var nextKind = next[SEG_KIND] as Number;
                var nextLabel = (nextKind == KIND_DISTANCE)
                    ? (next[SEG_NAME] as String) + " " + (next[SEG_DISTANCE] as Float).format("%d") + "m"
                    : (nextKind == KIND_LINE)
                        ? next[SEG_NAME] as String
                        : (next[SEG_NAME] as String) + " " + formatDuration(next[SEG_DURATION] as Number);
                dc.drawText(cx, h * 3 / 4 - 14, Graphics.FONT_XTINY,
                    "Next",
                    Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
                dc.drawText(cx, h * 3 / 4 + 10, Graphics.FONT_TINY,
                    nextLabel,
                    Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            } else if (mCurrentBlock < mBlocks.size() - 1) {
                dc.drawText(cx, h * 3 / 4 - 14, Graphics.FONT_XTINY,
                    "Next",
                    Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
                dc.drawText(cx, h * 3 / 4 + 10, Graphics.FONT_TINY,
                    ((mBlocks[mCurrentBlock + 1] as Dictionary)["n"] as String),
                    Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            }
        }
        dc.setColor(fgColor, Graphics.COLOR_TRANSPARENT);
    }

    hidden function drawComplete(dc as Dc, cx as Number, cy as Number, fgColor as ColorValue) as Void {
        var h = dc.getHeight();

        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, h / 4, Graphics.FONT_SMALL,
            "Session complete",
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

        if (mSessionStartMs > 0) {
            var elapsedSecs = (mSessionEndMs - mSessionStartMs) / 1000;
            var distM = mElapsedDistM - mSessionStartDistM;

            dc.setColor(fgColor, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, h / 2, Graphics.FONT_NUMBER_MEDIUM,
                formatDuration(elapsedSecs),
                Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            var distStr = (distM >= 1000.0f)
                ? (distM / 1000.0f).format("%.2f") + " km"
                : distM.format("%d") + " m";
            dc.drawText(cx, h * 3 / 4, Graphics.FONT_MEDIUM,
                distStr,
                Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        }
    }

}
