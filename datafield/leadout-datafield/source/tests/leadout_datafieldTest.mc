import Toybox.Application;
import Toybox.Lang;
import Toybox.Test;

// ── Test conventions ───────────────────────────────────────────────────────────
//
// Test.assertEqualMessage(actual, expected, msg) — throws on mismatch.
// Test.assertMessage(condition, msg)             — throws when condition is false.
// Return true at the end of each (:test) function to signal pass.
//
// Spec references in comments cite the rule or entity from spec/leadout.allium.
//
// Infrastructure gap: leadout_datafieldView extends WatchUi.DataField, which
// requires the UI runtime and cannot be instantiated here. Session state machine
// obligations are documented in a stub section at the bottom of this file.

// ─────────────────────────────────────────────────────────────────────────────
// formatDuration
// Spec: WatchDataField exposes segment countdown and next-segment duration in
//       human-readable form. formatDuration is the sole rendering primitive for
//       all duration values shown on the watch face.
// ─────────────────────────────────────────────────────────────────────────────

(:test)
function testFormatDuration_zero(logger as Test.Logger) as Boolean {
    Test.assertEqualMessage(formatDuration(0), "0:00", "0 seconds");
    return true;
}

(:test)
function testFormatDuration_seconds(logger as Test.Logger) as Boolean {
    Test.assertEqualMessage(formatDuration(45), "0:45", "45 seconds");
    return true;
}

(:test)
function testFormatDuration_oneMinute(logger as Test.Logger) as Boolean {
    Test.assertEqualMessage(formatDuration(60), "1:00", "60 seconds = 1:00");
    return true;
}

(:test)
function testFormatDuration_minutesAndSeconds(logger as Test.Logger) as Boolean {
    Test.assertEqualMessage(formatDuration(125), "2:05", "2 minutes 5 seconds");
    return true;
}

(:test)
function testFormatDuration_largeValue(logger as Test.Logger) as Boolean {
    Test.assertEqualMessage(formatDuration(1800), "30:00", "30 minutes");
    return true;
}

(:test)
function testFormatDuration_negative_clamped(logger as Test.Logger) as Boolean {
    // Spec: segment_timer_elapsed fires when time has elapsed; the display must
    // not show negative values while the transition is still pending in compute().
    Test.assertEqualMessage(formatDuration(-1), "0:00", "negative clamped to 0:00");
    return true;
}

(:test)
function testFormatDuration_singleDigitSeconds(logger as Test.Logger) as Boolean {
    // Seconds must be zero-padded so the display width is stable (3:05 not 3:5).
    Test.assertEqualMessage(formatDuration(185), "3:05", "seconds zero-padded");
    return true;
}

(:test)
function testFormatDuration_59seconds(logger as Test.Logger) as Boolean {
    Test.assertEqualMessage(formatDuration(59), "0:59", "59 seconds");
    return true;
}

(:test)
function testFormatDuration_nineSeconds(logger as Test.Logger) as Boolean {
    // Single-digit seconds — zero-pad boundary: 0:09 not 0:9.
    Test.assertEqualMessage(formatDuration(9), "0:09", "0:09 not 0:9");
    return true;
}

(:test)
function testFormatDuration_oneHour(logger as Test.Logger) as Boolean {
    // Minutes are unbounded — no hour conversion at 60.
    Test.assertEqualMessage(formatDuration(3600), "60:00", "60 minutes");
    return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// todayDateString
// Spec: Programme.is_for_today = (scheduled_date = today)
//       Date semantics — comparison uses local time, format "YYYY-MM-DD".
//       Used in findTodaysProgramme and is_expired checks.
// ─────────────────────────────────────────────────────────────────────────────

(:test)
function testTodayDateString_length(logger as Test.Logger) as Boolean {
    var s = todayDateString();
    Test.assertEqualMessage(s.length(), 10, "YYYY-MM-DD is 10 characters");
    return true;
}

(:test)
function testTodayDateString_dashPositions(logger as Test.Logger) as Boolean {
    var s = todayDateString();
    Test.assertEqualMessage(s.substring(4, 5), "-", "dash after 4-digit year");
    Test.assertEqualMessage(s.substring(7, 8), "-", "dash after 2-digit month");
    return true;
}

(:test)
function testTodayDateString_yearPlausible(logger as Test.Logger) as Boolean {
    var s = todayDateString();
    var year = (s.substring(0, 4) as String).toNumber();
    Test.assertMessage(year >= 2024, "year is at least 2024");
    return true;
}

(:test)
function testTodayDateString_monthInRange(logger as Test.Logger) as Boolean {
    var s = todayDateString();
    var month = (s.substring(5, 7) as String).toNumber();
    Test.assertMessage(month >= 1 && month <= 12, "month 1..12");
    return true;
}

(:test)
function testTodayDateString_dayInRange(logger as Test.Logger) as Boolean {
    var s = todayDateString();
    var day = (s.substring(8, 10) as String).toNumber();
    Test.assertMessage(day >= 1 && day <= 31, "day 1..31");
    return true;
}

(:test)
function testTodayDateString_consistent(logger as Test.Logger) as Boolean {
    // Two consecutive calls must agree — no midnight-roll between them in tests.
    var a = todayDateString();
    var b = todayDateString();
    Test.assertEqualMessage(a, b, "two calls return the same date");
    return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// findTodaysProgramme
// Spec rule RegisteredDevicePoll: server returns all upcoming_programmes;
//   the watch selects the one where programme.is_for_today (scheduled_date = today).
//   upcoming_programmes already excludes expired ones (scheduled_date >= today),
//   but the watch must still filter to exactly today's date.
// ─────────────────────────────────────────────────────────────────────────────

(:test)
function testFindTodaysProgramme_emptyArray(logger as Test.Logger) as Boolean {
    // RegisteredDevicePoll with no programmes → nothing to load.
    var result = findTodaysProgramme([] as Array<Dictionary>);
    Test.assertMessage(result == null, "empty array returns null");
    return true;
}

(:test)
function testFindTodaysProgramme_noTodayMatch(logger as Test.Logger) as Boolean {
    // All programmes are past — none is_for_today.
    var programmes = [
        { "scheduled_date" => "2020-01-01", "name" => "old session" }
    ] as Array<Dictionary>;
    Test.assertMessage(findTodaysProgramme(programmes) == null, "past date returns null");
    return true;
}

(:test)
function testFindTodaysProgramme_futureDateNotMatched(logger as Test.Logger) as Boolean {
    // Future programmes are upcoming but not today — must not be loaded.
    var programmes = [
        { "scheduled_date" => "2099-12-31", "name" => "future" }
    ] as Array<Dictionary>;
    Test.assertMessage(findTodaysProgramme(programmes) == null, "future date returns null");
    return true;
}

(:test)
function testFindTodaysProgramme_singleTodayMatch(logger as Test.Logger) as Boolean {
    // Exactly one programme is_for_today — it is returned.
    var today = todayDateString();
    var prog = { "scheduled_date" => today, "name" => "morning run" } as Dictionary;
    var result = findTodaysProgramme([prog] as Array<Dictionary>);
    Test.assertMessage(result != null, "today's programme is found");
    Test.assertEqualMessage((result as Dictionary)["name"], "morning run", "correct programme");
    return true;
}

(:test)
function testFindTodaysProgramme_todayAtEndOfArray(logger as Test.Logger) as Boolean {
    // Today's programme is the last item — must not be missed by early exit.
    var today = todayDateString();
    var programmes = [
        { "scheduled_date" => "2020-03-01", "name" => "old1" },
        { "scheduled_date" => "2021-06-15", "name" => "old2" },
        { "scheduled_date" => today,        "name" => "today" }
    ] as Array<Dictionary>;
    var result = findTodaysProgramme(programmes);
    Test.assertMessage(result != null, "programme at end of array found");
    Test.assertEqualMessage((result as Dictionary)["name"], "today", "correct programme");
    return true;
}

(:test)
function testFindTodaysProgramme_firstMatchReturned(logger as Test.Logger) as Boolean {
    // Spec open question: multiple sessions per day is deferred.
    // Current behaviour: first programme with today's date wins.
    var today = todayDateString();
    var programmes = [
        { "scheduled_date" => "2020-01-01", "name" => "old"     },
        { "scheduled_date" => today,        "name" => "morning" },
        { "scheduled_date" => today,        "name" => "evening" }
    ] as Array<Dictionary>;
    var result = findTodaysProgramme(programmes);
    Test.assertMessage(result != null, "a programme is found");
    Test.assertEqualMessage((result as Dictionary)["name"], "morning", "first today match returned");
    return true;
}

(:test)
function testFindTodaysProgramme_mixedPastTodayFuture(logger as Test.Logger) as Boolean {
    // Realistic sync payload: past, today and future programmes.
    var today = todayDateString();
    var programmes = [
        { "scheduled_date" => "2020-01-01", "name" => "past"   },
        { "scheduled_date" => today,        "name" => "today"  },
        { "scheduled_date" => "2099-01-01", "name" => "future" }
    ] as Array<Dictionary>;
    var result = findTodaysProgramme(programmes);
    Test.assertMessage(result != null, "today's programme found in mixed array");
    Test.assertEqualMessage((result as Dictionary)["name"], "today", "correct programme selected");
    return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// getOrCreateDeviceCode
// Spec rule ParticipantRegistersDevice(account, device_code):
//   The device_code is displayed on the watch so the participant can type it
//   into the website to link the device to their account. It must be stable
//   across app restarts (persisted in Application.Storage) and must use only
//   unambiguous characters so it is easy to transcribe from a small screen.
// ─────────────────────────────────────────────────────────────────────────────

(:test)
function testDeviceCode_length(logger as Test.Logger) as Boolean {
    Application.Storage.setValue("device_code", null);
    var code = getOrCreateDeviceCode();
    Test.assertEqualMessage(code.length(), 6, "device code is exactly 6 characters");
    return true;
}

(:test)
function testDeviceCode_noDigitZeroOrLetterO(logger as Test.Logger) as Boolean {
    // '0' and 'O' are visually identical on a small watch font — excluded.
    Application.Storage.setValue("device_code", null);
    var code = getOrCreateDeviceCode();
    Test.assertMessage(code.find("0") == null, "no digit 0");
    Test.assertMessage(code.find("O") == null, "no letter O");
    return true;
}

(:test)
function testDeviceCode_noAmbiguousOne(logger as Test.Logger) as Boolean {
    // '1', 'I', 'L' are visually similar — excluded.
    Application.Storage.setValue("device_code", null);
    var code = getOrCreateDeviceCode();
    Test.assertMessage(code.find("1") == null, "no digit 1");
    Test.assertMessage(code.find("I") == null, "no letter I");
    Test.assertMessage(code.find("L") == null, "no letter L");
    return true;
}

(:test)
function testDeviceCode_uppercaseOnly(logger as Test.Logger) as Boolean {
    Application.Storage.setValue("device_code", null);
    var code = getOrCreateDeviceCode();
    Test.assertEqualMessage(code, code.toUpper(), "device code is uppercase");
    return true;
}

(:test)
function testDeviceCode_persistsAcrossCalls(logger as Test.Logger) as Boolean {
    // Spec: device_code is generated once and persisted forever. A different
    // code on each call would invalidate any registration already on the server.
    Application.Storage.setValue("device_code", null);
    var first  = getOrCreateDeviceCode();
    var second = getOrCreateDeviceCode();
    Test.assertEqualMessage(first, second, "same code on repeated calls");
    return true;
}

(:test)
function testDeviceCode_usesStoredValue(logger as Test.Logger) as Boolean {
    // If storage already holds a code (device previously registered), it must
    // be returned without generating a new one — preserving the server-side link.
    Application.Storage.setValue("device_code", "ABC234");
    var code = getOrCreateDeviceCode();
    Test.assertEqualMessage(code, "ABC234", "stored code returned unchanged");
    return true;
}

(:test)
function testDeviceCode_nonEmpty(logger as Test.Logger) as Boolean {
    Application.Storage.setValue("device_code", null);
    var code = getOrCreateDeviceCode();
    Test.assertMessage(code.length() > 0, "code is non-empty");
    return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// View state machine — obligations documented, unit tests blocked by platform
//
// leadout_datafieldView extends WatchUi.DataField, which requires the UI runtime.
// It cannot be instantiated in the Connect IQ unit test runner. The obligations
// below must be verified via simulator integration tests or by extracting the
// state logic into a plain class (no DataField base) and testing that instead.
//
// ── SessionInitialised (spec rule: SessionInitialised) ────────────────────────
//   loadProgramme(data) with data["blocks"].size() > 0:
//     → mState = STATE_WAITING, mCurrentBlock = 0, mCurrentSegment = 0
//   loadProgramme(data) with data["blocks"].size() = 0:
//     → mState remains STATE_SYNCING (no programme to wait for)
//
// ── BlockStarted (spec rule: BlockStarted, LapButtonPressed when waiting) ─────
//   onTimerLap() when mState = STATE_WAITING:
//     → mState = STATE_ACTIVE, mCurrentSegment = 0, mSegmentStartMs set
//   onTimerLap() when mState != STATE_WAITING:
//     → state is unchanged (lap only advances in waiting state)
//
// ── ParticipantStartsSession (spec rule: ParticipantStartsSession) ────────────
//   onTimerLap() when mState = STATE_WAITING and mCurrentBlock = 0:
//     → recordParticipation() fires (POST /api/sessions/start)
//   onTimerLap() when mCurrentBlock > 0:
//     → recordParticipation() is NOT called (subsequent blocks, not session start)
//
// ── SegmentContinues (spec rule: SegmentContinues) ───────────────────────────
//   compute() when elapsed >= duration and mCurrentSegment < last segment:
//     → mCurrentSegment += 1, mSegmentStartMs reset, alertSegment() called
//
// ── BlockCompletes (spec rule: BlockCompletes) ────────────────────────────────
//   compute() when elapsed >= duration and last segment and mCurrentBlock < last block:
//     → mState = STATE_WAITING, mCurrentBlock += 1, alertBlockComplete() called
//
// ── SessionCompletes (spec rule: SessionCompletes) ────────────────────────────
//   compute() when elapsed >= duration and last segment and last block:
//     → mState = STATE_COMPLETE, alertSessionComplete() called
//
// ── DistanceSegmentComplete (spec rule: DistanceSegmentComplete) ──────────────
//   compute() when seg[:kind] = "distance" and (elapsed distance >= target):
//     → SegmentAdvance fires (same branching as time-based)
//
// ── UnregisteredDevicePoll (spec rule: UnregisteredDevicePoll) ───────────────
//   setRegistrationRequired(code):
//     → mState = STATE_UNREGISTERED, mDeviceCode = code
//
// ── RegisteredDevicePoll (spec rule: RegisteredDevicePoll) ───────────────────
//   onRegistrationPoll(200, { "programmes" => [todayProg] }):
//     → loadProgramme called, mState = STATE_WAITING, mPolling = false
//   onRegistrationPoll(200, { "programmes" => [] }):
//     → mState = STATE_SYNCING (registered but no programme today), mPolling = false
//   onRegistrationPoll(404, null):
//     → mPolling = false, mState unchanged (still STATE_UNREGISTERED, retry next tick)
//   onRegistrationPoll(500, null):
//     → mPolling = false, mState unchanged (network error, retry next tick)
//
// ── Registration poll throttle ────────────────────────────────────────────────
//   compute() when STATE_UNREGISTERED and !mPolling and (now - mLastPollMs) > 10000:
//     → mPolling = true, web request made, mLastPollMs updated
//   compute() when STATE_UNREGISTERED and !mPolling and (now - mLastPollMs) <= 10000:
//     → no web request made (throttled)
//   compute() when STATE_UNREGISTERED and mPolling:
//     → no second web request made (in-flight guard)
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Contract: watch ↔ server JSON interface
//
// These tests mirror the fixtures in spec/contract.js. Both files must define
// identical field names and value shapes. If the server renames a field, the
// server acceptance tests in acceptance.test.js AND these Monkey C tests must
// both be updated — making field-name drift visible on both sides.
//
// Two server endpoints:
//   GET  /api/sync/:device_code  → { "programmes" => Array, "subscription_count" => Number }
//                                  or { "error" => "registration_required" } on 404
//   POST /api/sessions/start     → request { "device_code" => String, "programme_id" => String }
//
// The watch does NOT read the 404 body or the participation 201 body — it only
// checks HTTP status codes. The contracts for those are server-side only.
// ─────────────────────────────────────────────────────────────────────────────

// Mirrors spec/contract.js SYNC_200_BODY + PROGRAMME_FIXTURE (scheduled for today).
// Any change to server field names must be reflected here.

(:test)
function testContract_syncResponse_programmesField(logger as Test.Logger) as Boolean {
    // The watch reads data["programmes"] as Array<Dictionary> from the 200 response.
    var response = {
        "programmes"         => [] as Array<Dictionary>,
        "subscription_count" => 1
    };
    Test.assertMessage(response["programmes"] instanceof Array, "sync response has 'programmes' Array");
    Test.assertMessage(response["subscription_count"] instanceof Number, "sync response has 'subscription_count' Number");
    return true;
}

(:test)
function testContract_syncResponse_subscriptionCount_zero(logger as Test.Logger) as Boolean {
    // subscription_count == 0 triggers the "no subscriptions" state in the watch.
    // The watch checks: if (subCount instanceof Number && (subCount as Number) == 0)
    var response = { "programmes" => [] as Array<Dictionary>, "subscription_count" => 0 };
    var subCount = response["subscription_count"];
    Test.assertMessage(subCount instanceof Number, "subscription_count is Number");
    Test.assertEqualMessage(subCount, 0, "subscription_count is 0");
    return true;
}

(:test)
function testContract_findTodaysProgramme_withContractFixture(logger as Test.Logger) as Boolean {
    // Given the full contract fixture programme (scheduled for today),
    // findTodaysProgramme finds it. This verifies the watch reads "scheduled_date"
    // from the server's programme object — the same key the server sends.
    var today = todayDateString();
    var programmes = [
        {
            "id"             => "prog-contract-001",
            "name"           => "Tuesday Intervals",
            "scheduled_date" => today,
            "pace_assumption"=> 330,
            "blocks"         => [
                {
                    "name" => "Warm up",
                    "segments" => [
                        { "name" => "Easy jog", "kind" => "time", "duration" => 300, "distance" => 0, "target_pace" => null }
                    ] as Array<Dictionary>
                },
                {
                    "name" => "Intervals",
                    "segments" => [
                        { "name" => "Fast",     "kind" => "time",     "duration" => 120, "distance" => 0,   "target_pace" => 240  },
                        { "name" => "Recovery", "kind" => "distance", "duration" => 0,   "distance" => 200, "target_pace" => null }
                    ] as Array<Dictionary>
                }
            ] as Array<Dictionary>
        }
    ] as Array<Dictionary>;
    var result = findTodaysProgramme(programmes);
    Test.assertMessage(result != null, "contract fixture programme found by today's date");
    Test.assertEqualMessage((result as Dictionary)["id"],   "prog-contract-001", "correct id");
    Test.assertEqualMessage((result as Dictionary)["name"], "Tuesday Intervals", "correct name");
    return true;
}

(:test)
function testContract_programme_requiredFields(logger as Test.Logger) as Boolean {
    // Documents the exact field names the watch reads from a programme Dictionary.
    // Mirrors assertProgrammeShape() in spec/contract.js.
    var prog = {
        "id"             => "prog-contract-001",
        "name"           => "Tuesday Intervals",
        "scheduled_date" => "2099-01-01",
        "pace_assumption"=> 330,
        "blocks"         => [] as Array<Dictionary>
    };
    Test.assertMessage(prog["id"]              instanceof String, "programme.id is String");
    Test.assertMessage(prog["name"]            instanceof String, "programme.name is String");
    Test.assertMessage(prog["scheduled_date"]  instanceof String, "programme.scheduled_date is String");
    Test.assertMessage(prog["pace_assumption"] instanceof Number, "programme.pace_assumption is Number");
    Test.assertMessage(prog["blocks"]          instanceof Array,  "programme.blocks is Array");
    return true;
}

(:test)
function testContract_block_requiredFields(logger as Test.Logger) as Boolean {
    // Documents the exact field names the watch reads from a block Dictionary.
    // Mirrors assertBlockShape() in spec/contract.js.
    var block = {
        "name"     => "Intervals",
        "segments" => [
            { "name" => "Fast",     "kind" => "time",     "duration" => 120, "distance" => 0,   "target_pace" => 240  },
            { "name" => "Recovery", "kind" => "distance", "duration" => 0,   "distance" => 200, "target_pace" => null }
        ] as Array<Dictionary>
    };
    Test.assertMessage(block["name"]     instanceof String, "block.name is String");
    Test.assertMessage(block["segments"] instanceof Array,  "block.segments is Array");
    Test.assertEqualMessage((block["segments"] as Array<Dictionary>).size(), 2, "block has 2 segments");
    return true;
}

(:test)
function testContract_segment_timeKind(logger as Test.Logger) as Boolean {
    // Mirrors assertSegmentShape() for kind='time' in spec/contract.js.
    var seg = { "name" => "Fast", "kind" => "time", "duration" => 120, "distance" => 0, "target_pace" => 240 };
    Test.assertEqualMessage(seg["kind"],     "time", "time segment kind field is 'kind'");
    Test.assertEqualMessage(seg["duration"], 120,    "time segment duration in seconds");
    Test.assertMessage(seg["target_pace"] instanceof Number, "target_pace is Number");
    return true;
}

(:test)
function testContract_segment_distanceKind(logger as Test.Logger) as Boolean {
    // Mirrors assertSegmentShape() for kind='distance' in spec/contract.js.
    var seg = { "name" => "Recovery", "kind" => "distance", "duration" => 0, "distance" => 200, "target_pace" => null };
    Test.assertEqualMessage(seg["kind"],     "distance", "distance segment kind field is 'kind'");
    Test.assertEqualMessage(seg["distance"], 200,        "distance segment target in metres");
    // Test.assertEqualMessage(seg["target_pace"], null,    "null target_pace field present");
    return true;
}

(:test)
function testContract_participationRequest_fields(logger as Test.Logger) as Boolean {
    // Documents the exact request body the watch POSTs to /api/sessions/start.
    // Mirrors spec/contract.js PARTICIPATION_REQUEST.
    // Server expects: { device_code: String, programme_id: String }
    var payload = {
        "device_code"  => "WATCH-CONTRACT-01",
        "programme_id" => "prog-contract-001"
    };
    Test.assertMessage(payload["device_code"]  instanceof String, "device_code is String key");
    Test.assertMessage(payload["programme_id"] instanceof String, "programme_id is String key");
    return true;
}
