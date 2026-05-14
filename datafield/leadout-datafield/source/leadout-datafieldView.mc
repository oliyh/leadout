import Toybox.Activity;
import Toybox.Application;
import Toybox.Attention;
import Toybox.Communications;
import Toybox.Graphics;
import Toybox.Lang;
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

    hidden var mState as SessionState;
    hidden var mFetchFailed as Boolean;
    hidden var mDeviceCode as String;
    hidden var mCurrentBlock as Number;
    hidden var mCurrentSegment as Number;
    hidden var mSegmentStartMs as Number;
    hidden var mProgrammeName as String;
    hidden var mProgrammeDate as String;
    hidden var mProgrammeId as String;
    hidden var mBlocks as Array<Dictionary>;
    hidden var mBlockNames as Array<String>;       // block names for pre-session display
    hidden var mCurrentPaceSec as Number;          // live pace in sec/km, 0 = no signal
    hidden var mSegmentStartDistM as Float;        // distance at segment start, -1 = uncaptured
    hidden var mElapsedDistM as Float;             // latest elapsed distance from Activity.Info
    hidden var mPolling as Boolean;                // registration poll in flight
    hidden var mLastPollMs as Number;              // last registration poll timestamp
    hidden var mLastErrorCode as Number;           // HTTP code from last failed sync
    hidden var mLastErrorMsg as String;            // server error string from last failed sync
    hidden var mSessionStartMs as Number;          // timer when first block started
    hidden var mSessionEndMs as Number;            // timer when STATE_COMPLETE reached
    hidden var mSessionStartDistM as Float;        // distance at session start
    hidden var mIsOldSdk as Boolean;               // cached isOldSdk() result

    // Repeat-loop state. Set when a block with a repeat segment begins, cleared
    // on block end or when the repeat exits. mRepeatStartIndex = -1 means not in a group.
    hidden var mRepeatStartIndex as Number;    // first segment index of the current group
    hidden var mRepeatStartMs as Number;       // getTimer() when the group began
    hidden var mRepeatStartDistM as Float;     // elapsedDistance when the group began
    hidden var mCurrentRep as Number;          // 1-based rep counter (which rep is running)

    function initialize() {
        DataField.initialize();

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
        mState = STATE_NO_SUBSCRIPTIONS;
        WatchUi.requestUpdate();
    }

    function setNoProgramme() as Void {
        mState = STATE_NO_PROGRAMME;
        WatchUi.requestUpdate();
    }

    // Resets all state back to STATE_SYNCING (used by the settings reset action).
    function reset() as Void {
        mState = STATE_SYNCING;
        mFetchFailed = false;
        mLastErrorCode = 0;
        mLastErrorMsg = "";
        mBlocks = [] as Array<Dictionary>;
        mBlockNames = [] as Array<String>;
        mProgrammeName = "";
        mProgrammeDate = "";
        mProgrammeId = "";
        mCurrentBlock = 0;
        mCurrentSegment = 0;
        WatchUi.requestUpdate();
    }

    // ── Input ─────────────────────────────────────────────────────────────

    function onTimerLap() as Void {
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

    // ── Logic ─────────────────────────────────────────────────────────────

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

        var segments = currentSegments();
        var seg = segments[mCurrentSegment];
        var kind = seg[:kind] as String;

        // Guard: repeat markers should never be the current segment, but skip if they are.
        if (kind.equals("repeat")) { return; }

        // ── Continuous time/distance exit check (can fire mid-segment) ────────
        if (mRepeatStartIndex >= 0) {
            var repSeg = currentRepeatMarkerSeg(segments);
            if (repSeg != null) {
                var repExitType = repSeg[:exit_type] as String;
                if (!repExitType.equals("count")) {
                    var elapsedMs = System.getTimer() - mRepeatStartMs;
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
        if (kind.equals("distance")) {
            var distTarget = seg[:distance] as Float;
            if (mSegmentStartDistM >= 0.0f) {
                advance = (mElapsedDistM - mSegmentStartDistM) >= distTarget;
            }
        } else {
            var duration = seg[:duration] as Number;
            var elapsedSecs = (System.getTimer() - mSegmentStartMs) / 1000;
            advance = elapsedSecs >= duration;
        }

        if (advance) {
            doAdvance(segments);
        }
    }

    // ── Repeat helpers ────────────────────────────────────────────────────

    // Called when a block starts. Scans for the first repeat segment; if found,
    // sets up group state so the header is visible from rep 1.
    hidden function initRepeatForBlock(segments as Array<Dictionary>) as Void {
        for (var i = 0; i < segments.size(); i++) {
            if (((segments[i] as Dictionary)[:kind] as String).equals("repeat")) {
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

    hidden function currentRepeatMarkerSeg(segments as Array<Dictionary>) as Dictionary? {
        for (var i = mRepeatStartIndex; i < segments.size(); i++) {
            var s = segments[i] as Dictionary;
            if ((s[:kind] as String).equals("repeat")) { return s; }
        }
        return null;
    }

    hidden function currentRepeatMarkerIdx(segments as Array<Dictionary>) as Number {
        for (var i = mRepeatStartIndex; i < segments.size(); i++) {
            if (((segments[i] as Dictionary)[:kind] as String).equals("repeat")) { return i; }
        }
        return -1;
    }

    hidden function doAdvance(segments as Array<Dictionary>) as Void {
        var nextIdx = mCurrentSegment + 1;

        if (nextIdx >= segments.size()) {
            doBlockOrSessionEnd();
            return;
        }

        var nextSeg = segments[nextIdx] as Dictionary;
        if ((nextSeg[:kind] as String).equals("repeat")) {
            var elapsedMs = System.getTimer() - mRepeatStartMs;
            var coveredM  = mElapsedDistM - mRepeatStartDistM;
            if (shouldExitRepeat(nextSeg, mCurrentRep, elapsedMs, coveredM)) {
                doRepeatExit(segments, nextIdx);
            } else {
                mCurrentRep    += 1;
                mCurrentSegment = mRepeatStartIndex;
                mSegmentStartMs = System.getTimer();
                mSegmentStartDistM = mElapsedDistM;
                alertSegment();
                triggerLapIfConfigured(false);
            }
        } else {
            mCurrentSegment    = nextIdx;
            mSegmentStartMs    = System.getTimer();
            mSegmentStartDistM = mElapsedDistM;
            alertSegment();
            triggerLapIfConfigured(false);
        }
    }

    // Called when the repeat exit condition is met. Advances past the repeat
    // marker and initialises the next group if another repeat follows.
    hidden function doRepeatExit(segments as Array<Dictionary>, repeatIdx as Number) as Void {
        var afterRepeat = repeatIdx + 1;

        // Look for a subsequent repeat group in this block.
        var nextRepeatIdx = -1;
        for (var i = afterRepeat; i < segments.size(); i++) {
            if (((segments[i] as Dictionary)[:kind] as String).equals("repeat")) {
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
            alertSegment();
            triggerLapIfConfigured(false);
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
            triggerLapIfConfigured(true);
        } else {
            mSessionEndMs = System.getTimer();
            mState        = STATE_COMPLETE;
            alertSessionComplete();
            triggerLapIfConfigured(true);
        }
    }

    // ── Programme loading ─────────────────────────────────────────────────

    // Reads programme name, date, id, and block names from the compact Storage format.
    // Clears mBlocks so segments are re-parsed fresh at session start.
    // Called at init, on sync arrival, and after registration completes.
    hidden function loadProgrammeHeader(data as Dictionary) as Void {
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

    // Builds mBlocks from the compact Storage format. Called just before session start.
    // Does not change mState, mCurrentBlock, or mCurrentSegment.
    // Compact segment array layout (from compressProgramme in Utils.mc):
    //   time/distance: [kind_int, name, duration, distance, target_pace]  (target_pace=-1 if none)
    //   repeat:        [2, exit_type_int, repeat_count, duration, distance]
    hidden function loadProgrammeSegments(data as Dictionary) as Void {
        var rawBlocks = data["b"];
        if (!(rawBlocks instanceof Array)) { return; }
        var jsonBlocks = rawBlocks as Array<Dictionary>;
        var blocks = [] as Array<Dictionary>;
        for (var i = 0; i < jsonBlocks.size(); i++) {
            var jb = jsonBlocks[i] as Dictionary;
            var rawSegs = jb["s"];
            if (!(rawSegs instanceof Array)) { continue; }
            var compSegs = rawSegs as Array<Array<Object>>;
            var segs = [] as Array<Dictionary>;
            for (var j = 0; j < compSegs.size(); j++) {
                var cs = compSegs[j] as Array<Object>;
                var kindInt = cs[0] as Number;
                if (kindInt == 2) {
                    var exitInt = cs[1] as Number;
                    var exitStr = (exitInt == 1) ? "time" : (exitInt == 2) ? "distance" : "count";
                    segs.add({
                        :name         => "Repeat",
                        :kind         => "repeat",
                        :exit_type    => exitStr,
                        :repeat_count => cs[2] as Number,
                        :duration     => cs[3] as Number,
                        :distance     => cs[4] as Float,
                        :target_pace  => null
                    });
                } else {
                    var segKind = (kindInt == 1) ? "distance" : "time";
                    var pace = cs[4] as Number;
                    segs.add({
                        :name        => cs[1] as String,
                        :kind        => segKind,
                        :duration    => cs[2] as Number,
                        :distance    => cs[3] as Float,
                        :target_pace => (pace == -1) ? null : pace
                    });
                }
            }
            blocks.add({
                :name     => (jb["n"] instanceof String) ? jb["n"] as String : "",
                :segments => segs
            });
        }
        mBlocks = blocks;
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

    (:typecheck(disableBackwardCompatibilityCheck))
    hidden function triggerLapIfConfigured(isBlockEnd as Boolean) as Void {
        if (shouldTriggerLap(isBlockEnd) && (Activity has :lap)) {
            Activity.lap();
        }
    }

    hidden function currentSegments() as Array<Dictionary> {
        return mBlocks[mCurrentBlock][:segments] as Array<Dictionary>;
    }

    // Uses mBlocks when the session is active (segments loaded), falls back to
    // mBlockNames (populated from header) when waiting before session start.
    hidden function currentBlockName() as String {
        if (mBlocks.size() > mCurrentBlock) {
            return mBlocks[mCurrentBlock][:name] as String;
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
        var seg = segments[mCurrentSegment];
        var segName = seg[:name] as String;
        var segKind = seg[:kind] as String;
        var targetPace = seg[:target_pace];  // Number sec/km or null

        // ── Repeat progress header (above segment name) ───────────────────
        if (mRepeatStartIndex >= 0) {
            var repSeg = currentRepeatMarkerSeg(segments);
            if (repSeg != null) {
                var exitType = repSeg[:exit_type] as String;
                var headerText = "";
                if (exitType.equals("count")) {
                    var total = repSeg[:repeat_count] as Number;
                    var current = mCurrentRep;
                    if (current > total) { current = total; }
                    headerText = current.format("%d") + "/" + total.format("%d");
                } else if (exitType.equals("time")) {
                    var target = repSeg[:duration] as Number;
                    var elapsedSecs = (System.getTimer() - mRepeatStartMs) / 1000;
                    var remaining = target - elapsedSecs;
                    if (remaining < 0) { remaining = 0; }
                    headerText = formatDuration(remaining);
                } else {
                    var target = repSeg[:distance] as Float;
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

        // ── Segment name ──────────────────────────────────────────────────
        dc.setColor(fgColor, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, h / 4, Graphics.FONT_MEDIUM,
            segName,
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

        // ── Main counter (time remaining or distance remaining) ────────────
        if (segKind.equals("distance")) {
            var distTarget = seg[:distance] as Float;
            var distDone = (mSegmentStartDistM >= 0.0f) ? (mElapsedDistM - mSegmentStartDistM) : 0.0f;
            var distRemaining = distTarget - distDone;
            if (distRemaining < 0.0f) { distRemaining = 0.0f; }
            dc.drawText(cx, h / 2, Graphics.FONT_NUMBER_HOT,
                distRemaining.format("%d") + "m",
                Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        } else {
            var duration = seg[:duration] as Number;
            var elapsedSecs = (System.getTimer() - mSegmentStartMs) / 1000;
            var remaining = duration - elapsedSecs;
            if (remaining < 0) { remaining = 0; }
            dc.drawText(cx, h / 2, Graphics.FONT_NUMBER_HOT,
                formatDuration(remaining),
                Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        }

        // ── Bottom area: pace (when target set) or next segment ───────────
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        if (targetPace != null) {
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
            dc.setColor(fgColor, Graphics.COLOR_TRANSPARENT);
            dc.drawText(rightX, valueY, Graphics.FONT_TINY,
                (mCurrentPaceSec > 0) ? formatDuration(mCurrentPaceSec) : "--:--",
                Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        } else {
            // Find next display segment — skip repeat markers
            var nextIdx = mCurrentSegment + 1;
            while (nextIdx < segments.size() && ((segments[nextIdx] as Dictionary)[:kind] as String).equals("repeat")) {
                nextIdx++;
            }
            if (nextIdx < segments.size()) {
                var next = segments[nextIdx] as Dictionary;
                var nextKind = next[:kind] as String;
                var nextLabel = nextKind.equals("distance")
                    ? (next[:name] as String) + " " + (next[:distance] as Float).format("%d") + "m"
                    : (next[:name] as String) + " " + formatDuration(next[:duration] as Number);
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
                    (mBlocks[mCurrentBlock + 1][:name] as String),
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
