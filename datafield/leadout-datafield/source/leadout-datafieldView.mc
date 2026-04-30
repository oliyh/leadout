import Toybox.Activity;
import Toybox.Application;
import Toybox.Attention;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;
import Toybox.WatchUi;

class leadout_datafieldView extends WatchUi.DataField {

    // ── State ─────────────────────────────────────────────────────────────

    enum SessionState {
        STATE_SYNCING,           // registered, waiting for first successful sync
        STATE_UNREGISTERED,      // device not registered — show device code
        STATE_NO_SUBSCRIPTIONS,  // synced OK but account has no channel subscriptions
        STATE_NO_PROGRAMME,      // synced OK, subscribed, but no programme today
        STATE_WAITING,           // programme loaded — lap press starts the next block
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
    hidden var mProgrammeId as String;
    hidden var mBlocks as Array<Dictionary>;
    hidden var mCurrentPaceSec as Number;      // live pace in sec/km, 0 = no signal
    hidden var mSegmentStartDistM as Float;    // distance at segment start, -1 = uncaptured
    hidden var mElapsedDistM as Float;         // latest elapsed distance from Activity.Info
    hidden var mPolling as Boolean;            // registration poll in flight
    hidden var mLastPollMs as Number;          // last registration poll timestamp
    hidden var mLastErrorCode as Number;       // HTTP code from last failed sync
    hidden var mLastErrorMsg as String;        // server error string from last failed sync
    hidden var mSessionStartMs as Number;      // timer when first block started
    hidden var mSessionEndMs as Number;        // timer when STATE_COMPLETE reached
    hidden var mSessionStartDistM as Float;    // distance at session start

    function initialize() {
        DataField.initialize();

        mState = STATE_SYNCING;
        mFetchFailed = false;
        mDeviceCode = "";
        mCurrentBlock = 0;
        mCurrentSegment = 0;
        mSegmentStartMs = 0;
        mBlocks = [] as Array<Dictionary>;
        mProgrammeName = "";
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

        var cached = Application.Storage.getValue("programme");
        if (cached instanceof Dictionary) {
            loadProgramme(cached as Dictionary);
        }
    }

    // No XML layout — everything drawn manually in onUpdate.
    function onLayout(dc as Dc) as Void {}

    // ── External API ──────────────────────────────────────────────────────

    function setProgramme(data as Dictionary) as Void {
        loadProgramme(data);
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
        mDeviceCode = deviceCode;
        mState = STATE_UNREGISTERED;
        mLastPollMs = 0;
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
        mProgrammeName = "";
        mProgrammeId = "";
        mCurrentBlock = 0;
        mCurrentSegment = 0;
        WatchUi.requestUpdate();
    }

    // ── Input ─────────────────────────────────────────────────────────────

    function onTimerLap() as Void {
        if (mState == STATE_UNREGISTERED) {
            if (Communications has :openWebPage) {
                Communications.openWebPage(API_BASE + "/register?code=" + mDeviceCode, null, null);
            }
            return;
        }
        if (mState == STATE_WAITING) {
            mState = STATE_ACTIVE;
            mCurrentSegment = 0;
            mSegmentStartMs = System.getTimer();
            mSegmentStartDistM = -1.0f;  // will be captured on first compute()
            if (mCurrentBlock == 0 && !mDeviceCode.equals("") && !mProgrammeId.equals("")) {
                mSessionStartMs = System.getTimer();
                mSessionStartDistM = mElapsedDistM;
                Application.Storage.setValue("pending_participation_id", mProgrammeId);
                recordParticipation();
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

        // While unregistered, poll every 10 s so the watch detects registration automatically.
        if (mState == STATE_UNREGISTERED && !mPolling) {
            var now = System.getTimer();
            if (now - mLastPollMs > 10000) {
                mLastPollMs = now;
                mPolling = true;
                makeSyncRequest(mDeviceCode, method(:onRegistrationPoll));
            }
        }

        if (mState != STATE_ACTIVE) {
            return;
        }

        var segments = currentSegments();
        var seg = segments[mCurrentSegment];
        var advance = false;

        var kind = seg[:kind] as String;
        if (kind.equals("distance")) {
            var distTarget = seg[:distance] as Float;
            if (mSegmentStartDistM >= 0.0f) {
                advance = (mElapsedDistM - mSegmentStartDistM) >= distTarget;
            }
        } else {
            // time-based (default)
            var duration = seg[:duration] as Number;
            var elapsedSecs = (System.getTimer() - mSegmentStartMs) / 1000;
            advance = elapsedSecs >= duration;
        }

        if (advance) {
            if (mCurrentSegment < segments.size() - 1) {
                mCurrentSegment += 1;
                mSegmentStartMs = System.getTimer();
                mSegmentStartDistM = mElapsedDistM;
                alertSegment();
            } else if (mCurrentBlock < mBlocks.size() - 1) {
                mCurrentBlock += 1;
                mCurrentSegment = 0;
                mState = STATE_WAITING;
                alertBlockComplete();
            } else {
                mSessionEndMs = System.getTimer();
                mState = STATE_COMPLETE;
                alertSessionComplete();
            }
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    hidden function loadProgramme(data as Dictionary) as Void {
        System.println("loadProgramme: name=" + data["name"] + " blocks=" + (data["blocks"] != null ? (data["blocks"] as Array<Object>).size() : "null"));
        var jsonBlocks = data["blocks"] as Array<Dictionary>;
        var blocks = [] as Array<Dictionary>;
        for (var i = 0; i < jsonBlocks.size(); i++) {
            var jb = jsonBlocks[i] as Dictionary;
            var jsonSegs = jb["segments"] as Array<Dictionary>;
            var segs = [] as Array<Dictionary>;
            for (var j = 0; j < jsonSegs.size(); j++) {
                var js = jsonSegs[j] as Dictionary;
                var segKind = (js["kind"] instanceof String) ? js["kind"] as String : "time";
                var segDist = (js["distance"] instanceof Float) ? js["distance"] as Float :
                              (js["distance"] instanceof Number) ? (js["distance"] as Number).toFloat() : 0.0f;
                segs.add({
                    :name       => js["name"] as String,
                    :kind       => segKind,
                    :duration   => (js["duration"] instanceof Number) ? js["duration"] as Number : 0,
                    :distance   => segDist,
                    :target_pace => (js["target_pace"] instanceof Number) ? js["target_pace"] as Number : null
                });
            }
            blocks.add({
                :name => jb["name"] as String,
                :segments => segs
            });
        }
        mBlocks = blocks;
        mProgrammeName = data["name"] as String;
        mProgrammeId = (data["id"] instanceof String) ? data["id"] as String : "";
        mCurrentBlock = 0;
        mCurrentSegment = 0;
        if (blocks.size() > 0) {
            mState = STATE_WAITING;
        }
    }

    // Fire-and-forget POST to /api/sessions/start. No retry on failure.
    hidden function recordParticipation() as Void {
        Communications.makeWebRequest(
            API_BASE + "/api/sessions/start",
            { "device_code" => mDeviceCode, "programme_id" => mProgrammeId },
            {
                :method       => Communications.HTTP_REQUEST_METHOD_POST,
                :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON,
                :headers      => { "Content-Type" => "application/json" }
            },
            method(:onParticipationResponse)
        );
    }

    function onParticipationResponse(responseCode as Number, data as Dictionary?) as Void {
        System.println("participation: " + responseCode);
    }

    // Callback for the registration poll (fired from compute() every 10 s in STATE_UNREGISTERED).
    // 200 → registered; load programme (or show appropriate empty state).
    // 404 → still unregistered; compute() will retry after 10 s.
    // Other → network issue; compute() will retry after 10 s.
    function onRegistrationPoll(responseCode as Number, data as Dictionary?) as Void {
        System.println("onRegistrationPoll: code=" + responseCode);
        mPolling = false;
        if (responseCode == 200 && data != null) {
            var programmes = data["programmes"] as Array<Dictionary>;
            var prog = findTodaysProgramme(programmes);
            if (prog != null) {
                Application.Storage.setValue("programme", prog);
                loadProgramme(prog);
            } else {
                var subCount = data["subscription_count"];
                if (subCount instanceof Number && (subCount as Number) == 0) {
                    mState = STATE_NO_SUBSCRIPTIONS;
                } else {
                    mState = STATE_NO_PROGRAMME;
                }
            }
            WatchUi.requestUpdate();
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

    hidden function currentSegments() as Array<Dictionary> {
        return mBlocks[mCurrentBlock][:segments] as Array<Dictionary>;
    }

    hidden function currentBlockName() as String {
        return mBlocks[mCurrentBlock][:name] as String;
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

        switch (mState) {
            case STATE_SYNCING:
                drawSyncing(dc, cx, cy, fgColor);
                break;
            case STATE_UNREGISTERED:
                drawUnregistered(dc, cx, cy, fgColor);
                break;
            case STATE_NO_SUBSCRIPTIONS:
                drawNoSubscriptions(dc, cx, cy, fgColor);
                break;
            case STATE_NO_PROGRAMME:
                drawNoProgramme(dc, cx, cy, fgColor);
                break;
            case STATE_WAITING:
                drawWaiting(dc, cx, cy, fgColor);
                break;
            case STATE_ACTIVE:
                drawActive(dc, cx, cy, fgColor);
                break;
            case STATE_COMPLETE:
                drawComplete(dc, cx, cy, fgColor);
                break;
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
                "Syncing...",
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
            "LAP to open on phone",
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
        } else if (mCurrentSegment < segments.size() - 1) {
            var next = segments[mCurrentSegment + 1];
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
