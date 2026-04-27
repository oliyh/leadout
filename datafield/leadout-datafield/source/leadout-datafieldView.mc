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
        STATE_SYNCING,       // registered, no programme received yet
        STATE_UNREGISTERED,  // device not registered — show device code
        STATE_WAITING,       // programme loaded — lap press starts the next block
        STATE_ACTIVE,        // running through segments in the current block
        STATE_COMPLETE       // all blocks done
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

    function setFetchFailed() as Void {
        if (mState == STATE_SYNCING) {
            mFetchFailed = true;
            WatchUi.requestUpdate();
        }
    }

    function setRegistrationRequired(deviceCode as String) as Void {
        mDeviceCode = deviceCode;
        mState = STATE_UNREGISTERED;
        WatchUi.requestUpdate();
    }

    function setDeviceCode(deviceCode as String) as Void {
        mDeviceCode = deviceCode;
    }

    // ── Input ─────────────────────────────────────────────────────────────

    function onTimerLap() as Void {
        if (mState == STATE_UNREGISTERED) {
            if (Communications has :openWebPage) {
                Communications.openWebPage(API_BASE + "/register", null, null);
            }
            return;
        }
        if (mState == STATE_WAITING) {
            mState = STATE_ACTIVE;
            mCurrentSegment = 0;
            mSegmentStartMs = System.getTimer();
            if (mCurrentBlock == 0 && !mDeviceCode.equals("") && !mProgrammeId.equals("")) {
                recordParticipation();
            }
        }
    }

    // ── Logic ─────────────────────────────────────────────────────────────

    function compute(info as Activity.Info) as Void {
        if (mState != STATE_ACTIVE) {
            return;
        }

        var segments = currentSegments();
        var duration = segments[mCurrentSegment][:duration] as Number;
        var elapsedSecs = (System.getTimer() - mSegmentStartMs) / 1000;

        if (elapsedSecs >= duration) {
            if (mCurrentSegment < segments.size() - 1) {
                mCurrentSegment += 1;
                mSegmentStartMs = System.getTimer();
                alertSegment();
            } else if (mCurrentBlock < mBlocks.size() - 1) {
                mCurrentBlock += 1;
                mCurrentSegment = 0;
                mState = STATE_WAITING;
                alertBlockComplete();
            } else {
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
                segs.add({
                    :name => js["name"] as String,
                    :duration => js["duration"] as Number
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
            case STATE_WAITING:
                drawWaiting(dc, cx, cy, fgColor);
                break;
            case STATE_ACTIVE:
                drawActive(dc, cx, cy, fgColor);
                break;
            case STATE_COMPLETE:
                drawComplete(dc, cx, cy);
                break;
        }
    }

    hidden function drawSyncing(dc as Dc, cx as Number, cy as Number, fgColor as ColorValue) as Void {
        if (mFetchFailed) {
            dc.drawText(cx, cy - 10, Graphics.FONT_SMALL,
                "No connection",
                Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, cy + 20, Graphics.FONT_XTINY,
                "Open Leadout widget",
                Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        } else {
            dc.drawText(cx, cy, Graphics.FONT_SMALL,
                "Syncing...",
                Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        }
    }

    // Shown when the server says this device_code is not registered.
    // Pressing LAP opens leadout.oliy.co.uk/register in the paired phone browser.
    hidden function drawUnregistered(dc as Dc, cx as Number, cy as Number, fgColor as ColorValue) as Void {
        var h = dc.getHeight();

        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, h / 4, Graphics.FONT_XTINY,
            "leadout.oliy.co.uk/register",
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, h / 2 - 14, Graphics.FONT_XTINY,
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
        var segDuration = seg[:duration] as Number;

        var elapsedSecs = (System.getTimer() - mSegmentStartMs) / 1000;
        var remaining = segDuration - elapsedSecs;
        if (remaining < 0) { remaining = 0; }

        dc.setColor(fgColor, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, h / 4, Graphics.FONT_MEDIUM,
            segName,
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

        dc.drawText(cx, h / 2, Graphics.FONT_NUMBER_HOT,
            formatDuration(remaining),
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        if (mCurrentSegment < segments.size() - 1) {
            var next = segments[mCurrentSegment + 1];
            dc.drawText(cx, h * 3 / 4 - 28, Graphics.FONT_XTINY,
                "Next",
                Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            dc.drawText(cx, h * 3 / 4 + 4, Graphics.FONT_TINY,
                (next[:name] as String) + " " + formatDuration(next[:duration] as Number),
                Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        } else if (mCurrentBlock < mBlocks.size() - 1) {
            dc.drawText(cx, h * 3 / 4 - 28, Graphics.FONT_XTINY,
                "Next",
                Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            dc.drawText(cx, h * 3 / 4 + 4, Graphics.FONT_TINY,
                (mBlocks[mCurrentBlock + 1][:name] as String),
                Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        }
        dc.setColor(fgColor, Graphics.COLOR_TRANSPARENT);
    }

    hidden function drawComplete(dc as Dc, cx as Number, cy as Number) as Void {
        dc.drawText(cx, cy - 10, Graphics.FONT_MEDIUM,
            "Session",
            Graphics.TEXT_JUSTIFY_CENTER);
        dc.drawText(cx, cy + 20, Graphics.FONT_MEDIUM,
            "complete!",
            Graphics.TEXT_JUSTIFY_CENTER);
    }

}
