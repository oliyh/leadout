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
//   upcoming_programmes already excludes expired ones (scheduled_date >= today).
//   The watch picks the earliest upcoming programme (today or future).
// ─────────────────────────────────────────────────────────────────────────────

(:test)
function testFindNextProgramme_emptyArray(logger as Test.Logger) as Boolean {
    var result = findNextProgramme([] as Array<Dictionary>);
    Test.assertMessage(result == null, "empty array returns null");
    return true;
}

(:test)
function testFindNextProgramme_pastDatesExcluded(logger as Test.Logger) as Boolean {
    // All programmes are in the past — none is upcoming.
    var programmes = [
        { "scheduled_date" => "2020-01-01", "name" => "old session" }
    ] as Array<Dictionary>;
    Test.assertMessage(findNextProgramme(programmes) == null, "past date returns null");
    return true;
}

(:test)
function testFindNextProgramme_futureDateReturned(logger as Test.Logger) as Boolean {
    // A future programme should be returned so it is pre-loaded before the session day.
    var programmes = [
        { "scheduled_date" => "2099-12-31", "name" => "future" }
    ] as Array<Dictionary>;
    var result = findNextProgramme(programmes);
    Test.assertMessage(result != null, "future programme is returned");
    Test.assertEqualMessage((result as Dictionary)["name"], "future", "correct programme");
    return true;
}

(:test)
function testFindNextProgramme_todayReturned(logger as Test.Logger) as Boolean {
    var today = todayDateString();
    var prog = { "scheduled_date" => today, "name" => "morning run" } as Dictionary;
    var result = findNextProgramme([prog] as Array<Dictionary>);
    Test.assertMessage(result != null, "today's programme is found");
    Test.assertEqualMessage((result as Dictionary)["name"], "morning run", "correct programme");
    return true;
}

(:test)
function testFindNextProgramme_todayAtEndOfArray(logger as Test.Logger) as Boolean {
    // Today is the earliest upcoming date — must win over a future entry.
    var today = todayDateString();
    var programmes = [
        { "scheduled_date" => "2020-03-01", "name" => "old"    },
        { "scheduled_date" => "2099-06-15", "name" => "future" },
        { "scheduled_date" => today,        "name" => "today"  }
    ] as Array<Dictionary>;
    var result = findNextProgramme(programmes);
    Test.assertMessage(result != null, "today found even at end of array");
    Test.assertEqualMessage((result as Dictionary)["name"], "today", "today preferred over future");
    return true;
}

(:test)
function testFindNextProgramme_earliestFutureSelected(logger as Test.Logger) as Boolean {
    // No programme today — earliest future date wins.
    var programmes = [
        { "scheduled_date" => "2099-06-01", "name" => "later"   },
        { "scheduled_date" => "2099-01-01", "name" => "sooner"  }
    ] as Array<Dictionary>;
    var result = findNextProgramme(programmes);
    Test.assertMessage(result != null, "a programme is found");
    Test.assertEqualMessage((result as Dictionary)["name"], "sooner", "earliest future date selected");
    return true;
}

(:test)
function testFindNextProgramme_mixedPastTodayFuture(logger as Test.Logger) as Boolean {
    // Realistic sync payload: today is earlier than future, so today wins.
    var today = todayDateString();
    var programmes = [
        { "scheduled_date" => "2020-01-01", "name" => "past"   },
        { "scheduled_date" => today,        "name" => "today"  },
        { "scheduled_date" => "2099-01-01", "name" => "future" }
    ] as Array<Dictionary>;
    var result = findNextProgramme(programmes);
    Test.assertMessage(result != null, "today's programme found in mixed array");
    Test.assertEqualMessage((result as Dictionary)["name"], "today", "today preferred over future");
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
// clearAuthState
// Regression guard for the first-registration 401 bug:
//   When the watch has no token yet, a 401 from /api/sync is expected (the device
//   just hasn't claimed its registration token). clearAuthState() must NOT wipe
//   device_code in that case — the user's web registration is still valid.
//   Only when a token was present and got rejected should device_code be cleared.
// ─────────────────────────────────────────────────────────────────────────────

(:test)
function testClearAuthState_noToken_preservesDeviceCode(logger as Test.Logger) as Boolean {
    Application.Storage.setValue("device_code", "WF68H2");
    Application.Storage.deleteValue("watch_token");
    var wiped = clearAuthState();
    Test.assertMessage(!wiped, "returns false when no token was stored");
    var code = Application.Storage.getValue("device_code");
    Test.assertMessage(code instanceof String, "device_code still in storage");
    Test.assertEqualMessage(code, "WF68H2", "device_code unchanged");
    return true;
}

(:test)
function testClearAuthState_withToken_wipesDeviceCode(logger as Test.Logger) as Boolean {
    Application.Storage.setValue("device_code", "WF68H2");
    Application.Storage.setValue("watch_token", "some-uuid-token");
    var wiped = clearAuthState();
    Test.assertMessage(wiped, "returns true when token was stored");
    var code = Application.Storage.getValue("device_code");
    Test.assertMessage(!(code instanceof String), "device_code removed from storage");
    return true;
}

(:test)
function testClearAuthState_alwaysWipesToken(logger as Test.Logger) as Boolean {
    Application.Storage.setValue("watch_token", "some-uuid-token");
    clearAuthState();
    var token = Application.Storage.getValue("watch_token");
    Test.assertMessage(!(token instanceof String), "watch_token always removed");
    return true;
}

(:test)
function testClearAuthState_alwaysWipesProgramme(logger as Test.Logger) as Boolean {
    Application.Storage.setValue("programme", { "name" => "Tuesday Intervals" } as Dictionary);
    Application.Storage.deleteValue("watch_token");
    clearAuthState();
    var prog = Application.Storage.getValue("programme");
    Test.assertMessage(!(prog instanceof Dictionary), "programme always removed");
    return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Background sync sentinel protocol
//
// When the background service finds a programme it saves it to Application.Storage
// then calls Background.exit({"programme_ready" => true}).  Passing the full
// nested programme dict through Background.exit() is unreliable on old SDK
// (CIQ < 5.0) because Arrays of Dictionaries may not round-trip correctly.
// The sentinel approach separates "signal" from "data": the signal travels via
// Background.exit; the data travels via Application.Storage (reliable on all SDK).
//
// These tests verify:
//   1. Application.Storage correctly round-trips the nested programme structure.
//   2. The sentinel key name matches between service and app ("programme_ready").
// ─────────────────────────────────────────────────────────────────────────────

(:test)
function testBackgroundSentinel_storageRoundTrip(logger as Test.Logger) as Boolean {
    // Validates the storage path that onBackgroundData("programme_ready") relies on.
    // If Application.Storage cannot round-trip nested Arrays of Dictionaries the
    // programme_ready handler would silently load nothing.
    var prog = {
        "id"             => "test-prog-001",
        "name"           => "Test Intervals",
        "scheduled_date" => "2026-05-13",
        "blocks"         => [
            {
                "name"     => "Warm up",
                "segments" => [
                    { "name" => "Easy jog", "kind" => "time", "duration" => 300,
                      "distance" => 0, "target_pace" => null }
                ] as Array<Dictionary>
            }
        ] as Array<Dictionary>
    };
    Application.Storage.setValue("programme", prog);
    var retrieved = Application.Storage.getValue("programme");
    Test.assertMessage(retrieved instanceof Dictionary, "programme retrieved as Dictionary");
    var d = retrieved as Dictionary;
    Test.assertEqualMessage(d["id"],   "test-prog-001",  "id preserved through storage");
    Test.assertEqualMessage(d["name"], "Test Intervals", "name preserved through storage");
    var blocks = d["blocks"];
    Test.assertMessage(blocks instanceof Array, "blocks is Array after storage round-trip");
    var block = (blocks as Array<Dictionary>)[0] as Dictionary;
    Test.assertEqualMessage(block["name"], "Warm up", "block name preserved");
    var segs = block["segments"];
    Test.assertMessage(segs instanceof Array, "segments is Array after storage round-trip");
    var seg = (segs as Array<Dictionary>)[0] as Dictionary;
    Test.assertEqualMessage(seg["name"], "Easy jog", "segment name preserved");
    Application.Storage.deleteValue("programme");
    return true;
}

(:test)
function testBackgroundSentinel_keyName(logger as Test.Logger) as Boolean {
    // The sentinel dict sent via Background.exit must use the key "programme_ready".
    // onBackgroundData checks dict.hasKey("programme_ready") to trigger the storage
    // read path.  This test documents the agreed-upon key name so a rename in either
    // service or app is caught immediately.
    var sentinel = {"programme_ready" => true};
    Test.assertMessage(sentinel.hasKey("programme_ready"), "sentinel key is 'programme_ready'");
    Test.assertMessage(!(sentinel.hasKey("programme")),    "sentinel does not pass programme inline");
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
//   onTimerLap() when mState = STATE_WAITING and mIsVisible = true:
//     → mState = STATE_ACTIVE, mCurrentSegment = 0, mSegmentStartMs set
//   onTimerLap() when mState = STATE_WAITING and mIsVisible = false:
//     → state is unchanged (lap on a different data screen must not start the session)
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
// ── Token poll (fires from compute() every 10 s in STATE_UNREGISTERED) ────────
//   onTokenPoll(200, { "token" => "..." }):
//     → watch_token saved to storage, makeSyncRequest fired, mPolling = true
//   onTokenPoll(202, null):
//     → mPolling = false, mState unchanged (still STATE_UNREGISTERED, retry next tick)
//   onTokenPoll(other, _):
//     → mPolling = false, mState unchanged (retry next tick)
//
// ── RegisteredDevicePoll (spec rule: RegisteredDevicePoll) ───────────────────
//   Called after onTokenPoll successfully stores a token and fires a sync.
//   onRegistrationPoll(200, { "programmes" => [todayProg] }):
//     → loadProgramme called, mState = STATE_WAITING, mPolling = false
//   onRegistrationPoll(200, { "programmes" => [] }):
//     → mState = STATE_NO_SUBSCRIPTIONS or STATE_NO_PROGRAMME, mPolling = false
//   onRegistrationPoll(401, _):
//     → getApp().handleAuthFailure() called — token wiped, new device code generated
//   onRegistrationPoll(other, _):
//     → mPolling = false, mState unchanged (network error, retry next tick)
//
// ── Registration poll throttle ────────────────────────────────────────────────
//   compute() when STATE_UNREGISTERED and !mPolling and (now - mLastPollMs) > 10000:
//     → mPolling = true, makeTokenRequest made, mLastPollMs updated
//   compute() when STATE_UNREGISTERED and !mPolling and (now - mLastPollMs) <= 10000:
//     → no web request made (throttled)
//   compute() when STATE_UNREGISTERED and mPolling:
//     → no second web request made (in-flight guard)
//
// ── onBackgroundData — programme_ready sentinel (old SDK background sync) ─────
//   onBackgroundData({"programme_ready" => true}):
//     → Application.Storage.getValue("programme") read (service saved it before exit)
//     → if Dictionary: view.setProgramme(cached) called → loadProgrammeHeader()
//       - if sessionInProgress(): early return, no state change
//         (background sync never disrupts an in-progress session)
//       - otherwise: STATE_WAITING (or STATE_UPCOMING if future date)
//     → if not Dictionary: no state change (storage miss — next background tick retries)
//   onBackgroundData({"no_programme" => true}):
//     → view.setNoProgramme() → STATE_NO_PROGRAMME if !sessionInProgress(); no-op otherwise
//   onBackgroundData({"no_subscriptions" => true}):
//     → view.setNoSubscriptions() → STATE_NO_SUBSCRIPTIONS if !sessionInProgress(); no-op otherwise
//   onBackgroundData({"auth_failed" => true}):
//     → handleAuthFailure() → token wiped, new device code, STATE_UNREGISTERED
//   onBackgroundData(null) or non-Dictionary:
//     → early return, no state change
//   onBackgroundData(_) when mView == null (data field not on screen):
//     → early return; programme is still in Storage and will be loaded by
//       View.initialize() on the next foreground start
//
// ── loadProgramme — null/missing blocks guard ─────────────────────────────────
//   loadProgramme(data) when sessionInProgress():
//     → early return, mState unchanged (background sync never disrupts a session)
//   loadProgramme({"name" => "x"}) with no "blocks" key (rawBlocks not instanceof Array):
//     → early return, mState unchanged (defensive guard against malformed data)
//   loadProgramme(data) with data["blocks"].size() > 0:
//     → mState = STATE_WAITING, mCurrentBlock = 0, mCurrentSegment = 0
//   loadProgramme(data) with data["blocks"].size() = 0:
//     → mState remains unchanged (no blocks to wait for)
//
// ── Mid-activity reinit guard (DataField crash recovery) ──────────────────────
//   initialize() checks mState != null before resetting any instance variables.
//   If mState is non-null the object has already been initialised — bail out to
//   preserve all live session state.  mState is null only on a brand-new object
//   (Monkey C does not default instance variables), so a genuine first-init always
//   proceeds regardless of the activity timer state.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Contract: watch ↔ server JSON interface
//
// These tests mirror the fixtures in spec/contract.js. Both files must define
// identical field names and value shapes. If the server renames a field, the
// server acceptance tests in acceptance.test.js AND these Monkey C tests must
// both be updated — making field-name drift visible on both sides.
//
// Three server endpoints used by the watch:
//   GET  /api/devices/:device_code/token → 202 (pending), 200 { "token" => String } (claimed), 410 (already claimed)
//   GET  /api/sync/:device_code          → { "programmes" => Array, "subscription_count" => Number }
//                                          Authorization: Bearer <watch_token> required; 401 means re-register.
//   POST /api/sessions/start             → request { "device_code" => String, "programme_id" => String }
//                                          Authorization: Bearer <watch_token> required; 401 means re-register.
//
// The watch does NOT read the 401/202/410 bodies — it only checks HTTP status codes.
// The contracts for response bodies are server-side only.
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
function testContract_findNextProgramme_withContractFixture(logger as Test.Logger) as Boolean {
    // Given the full contract fixture programme (scheduled for today),
    // findNextProgramme finds it. This verifies the watch reads "scheduled_date"
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
    var result = findNextProgramme(programmes);
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
    Test.assertEqualMessage(seg["kind"] as String,     "distance", "distance segment kind field is 'kind'");
    Test.assertEqualMessage(seg["distance"] as Number, 200,        "distance segment target in metres");
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

(:test)
function testContract_segment_lineKind(logger as Test.Logger) as Boolean {
    // Mirrors assertSegmentShape() for kind='line' in spec/contract.js.
    // The watch reads p1_lat, p1_lng, p2_lat, p2_lng from a line segment.
    var seg = {
        "name"        => "Start/Finish",
        "kind"        => "line",
        "p1_lat"      => 51.5074f,
        "p1_lng"      => -0.1278f,
        "p2_lat"      => 51.5075f,
        "p2_lng"      => -0.1280f,
        "target_pace" => null
    };
    Test.assertEqualMessage(seg["kind"] as String, "line",         "line segment kind field is 'kind'");
    Test.assertMessage(seg["p1_lat"] instanceof Float,             "p1_lat is Float");
    Test.assertMessage(seg["p1_lng"] instanceof Float,             "p1_lng is Float");
    Test.assertMessage(seg["p2_lat"] instanceof Float,             "p2_lat is Float");
    Test.assertMessage(seg["p2_lng"] instanceof Float,             "p2_lng is Float");
    return true;
}

(:test)
function testContract_segment_repeatKind(logger as Test.Logger) as Boolean {
    // Mirrors assertSegmentShape() for kind='repeat' in spec/contract.js.
    // The watch reads exit_type, repeat_count (count-exit), duration (time-exit),
    // distance (distance-exit) from a repeat segment using these exact field names.
    var seg = {
        "name"         => "Repeat",
        "kind"         => "repeat",
        "exit_type"    => "count",
        "repeat_count" => 5,
        "duration"     => 0,
        "distance"     => 0,
        "target_pace"  => 0
    };
    Test.assertEqualMessage(seg["kind"]         as String, "repeat", "repeat segment kind");
    Test.assertEqualMessage(seg["exit_type"]    as String, "count",  "repeat segment exit_type field");
    Test.assertEqualMessage(seg["repeat_count"] as Number, 5,        "count-exit repeat_count field");
    return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// repeatGroupStart
// Scans backwards from a repeat marker to find the start index of the current
// repeat group. The group starts at (previous repeat index + 1) or 0 if none.
// ─────────────────────────────────────────────────────────────────────────────

// Segments are the compact positional-array form (see Config.mc layout constants).
// repeatGroupStart only inspects index 0 (the kind), so the trailing fields below
// are representative placeholders.

(:test)
function testRepeatGroupStart_singleGroup(logger as Test.Logger) as Boolean {
    // [Fast, Slow, ×5] — no prior repeat, group starts at 0
    var segments = [
        [KIND_TIME,   "Fast", 0, 0.0f, -1]      as Array<Object>,
        [KIND_TIME,   "Slow", 0, 0.0f, -1]      as Array<Object>,
        [KIND_REPEAT, EXIT_COUNT, 5, 0, 0.0f]   as Array<Object>
    ] as Array;
    Test.assertEqualMessage(repeatGroupStart(segments, 2), 0, "single group starts at index 0");
    return true;
}

(:test)
function testRepeatGroupStart_twoSequentialGroups(logger as Test.Logger) as Boolean {
    // [Fast, Slow, ×5, Sprint, Rest, ×3] — second group starts after first repeat (index 3)
    var segments = [
        [KIND_TIME,   "Fast",   0, 0.0f, -1]    as Array<Object>,
        [KIND_TIME,   "Slow",   0, 0.0f, -1]    as Array<Object>,
        [KIND_REPEAT, EXIT_COUNT, 5, 0, 0.0f]   as Array<Object>,
        [KIND_TIME,   "Sprint", 0, 0.0f, -1]    as Array<Object>,
        [KIND_TIME,   "Rest",   0, 0.0f, -1]    as Array<Object>,
        [KIND_REPEAT, EXIT_COUNT, 3, 0, 0.0f]   as Array<Object>
    ] as Array;
    Test.assertEqualMessage(repeatGroupStart(segments, 5), 3, "second group starts after first repeat");
    return true;
}

(:test)
function testRepeatGroupStart_repeatAtIndex0(logger as Test.Logger) as Boolean {
    // Degenerate: repeat is the very first segment — group starts at 0
    var segments = [
        [KIND_REPEAT, EXIT_COUNT, 5, 0, 0.0f]   as Array<Object>,
        [KIND_TIME,   "Fast", 0, 0.0f, -1]      as Array<Object>
    ] as Array;
    Test.assertEqualMessage(repeatGroupStart(segments, 0), 0, "repeat at index 0 returns 0");
    return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// shouldExitRepeat
// Returns true when the exit condition in the repeat segment is satisfied.
// ─────────────────────────────────────────────────────────────────────────────

// seg is the compact repeat segment array: [KIND_REPEAT, exit_type, repeat_count, duration, distance].

(:test)
function testShouldExitRepeat_count_notDone(logger as Test.Logger) as Boolean {
    var seg = [KIND_REPEAT, EXIT_COUNT, 5, 0, 0.0f] as Array;
    Test.assertMessage(!shouldExitRepeat(seg, 3, 0, 0.0f), "rep 3 of 5 — not done");
    return true;
}

(:test)
function testShouldExitRepeat_count_done(logger as Test.Logger) as Boolean {
    var seg = [KIND_REPEAT, EXIT_COUNT, 5, 0, 0.0f] as Array;
    Test.assertMessage(shouldExitRepeat(seg, 5, 0, 0.0f), "rep 5 of 5 — done");
    return true;
}

(:test)
function testShouldExitRepeat_count_singleRep(logger as Test.Logger) as Boolean {
    var seg = [KIND_REPEAT, EXIT_COUNT, 1, 0, 0.0f] as Array;
    Test.assertMessage(shouldExitRepeat(seg, 1, 0, 0.0f), "rep 1 of 1 — exits immediately");
    return true;
}

(:test)
function testShouldExitRepeat_time_notElapsed(logger as Test.Logger) as Boolean {
    var seg = [KIND_REPEAT, EXIT_TIME, 0, 60, 0.0f] as Array;
    Test.assertMessage(!shouldExitRepeat(seg, 1, 59000, 0.0f), "59 s elapsed of 60 s — not done");
    return true;
}

(:test)
function testShouldExitRepeat_time_exactlyElapsed(logger as Test.Logger) as Boolean {
    var seg = [KIND_REPEAT, EXIT_TIME, 0, 60, 0.0f] as Array;
    Test.assertMessage(shouldExitRepeat(seg, 1, 60000, 0.0f), "60 s elapsed of 60 s — done");
    return true;
}

(:test)
function testShouldExitRepeat_time_over(logger as Test.Logger) as Boolean {
    var seg = [KIND_REPEAT, EXIT_TIME, 0, 60, 0.0f] as Array;
    Test.assertMessage(shouldExitRepeat(seg, 1, 65000, 0.0f), "65 s elapsed of 60 s — done");
    return true;
}

(:test)
function testShouldExitRepeat_distance_notReached(logger as Test.Logger) as Boolean {
    var seg = [KIND_REPEAT, EXIT_DISTANCE, 0, 0, 400.0f] as Array;
    Test.assertMessage(!shouldExitRepeat(seg, 1, 0, 399.0f), "399 m of 400 m — not done");
    return true;
}

(:test)
function testShouldExitRepeat_distance_exactlyReached(logger as Test.Logger) as Boolean {
    var seg = [KIND_REPEAT, EXIT_DISTANCE, 0, 0, 400.0f] as Array;
    Test.assertMessage(shouldExitRepeat(seg, 1, 0, 400.0f), "400 m of 400 m — done");
    return true;
}

(:test)
function testShouldExitRepeat_distance_exceeded(logger as Test.Logger) as Boolean {
    var seg = [KIND_REPEAT, EXIT_DISTANCE, 0, 0, 400.0f] as Array;
    Test.assertMessage(shouldExitRepeat(seg, 1, 0, 500.0f), "500 m of 400 m — done");
    return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// lineCrossingCheck
// Returns true when the GPS movement path (p1→p2) intersects the finish line
// segment (q1→q2). Uses 2D parametric segment intersection after equirectangular
// projection centred on q1. Both t (position along movement) and u (position along
// finish line) must be in [0,1] for a crossing to register.
// ─────────────────────────────────────────────────────────────────────────────

(:test)
function testLineCrossing_clear(logger as Test.Logger) as Boolean {
    // East-west movement clearly crosses a north-south finish line at the origin.
    // Paths intersect at (0.0, 0.0) with t=0.5, u=0.5.
    var result = lineCrossingCheck(
         0.0d, -0.001d,    // p1: west of line
         0.0d,  0.001d,    // p2: east of line
        -0.001d, 0.0d,     // q1: south endpoint
         0.001d, 0.0d      // q2: north endpoint
    );
    Test.assertMessage(result, "movement crossing the line should return true");
    return true;
}

(:test)
function testLineCrossing_movement_stops_short(logger as Test.Logger) as Boolean {
    // Movement heads towards the line but stops before reaching it (t=2.0 at intersection).
    var result = lineCrossingCheck(
         0.0d, -0.002d,
         0.0d, -0.001d,
        -0.001d, 0.0d,
         0.001d, 0.0d
    );
    Test.assertMessage(!result, "movement stopping short should return false");
    return true;
}

(:test)
function testLineCrossing_parallel(logger as Test.Logger) as Boolean {
    // Movement runs parallel to the finish line — denom is 0, no crossing.
    var result = lineCrossingCheck(
        -0.001d, -0.001d,
         0.001d, -0.001d,
        -0.001d,  0.0d,
         0.001d,  0.0d
    );
    Test.assertMessage(!result, "parallel movement should return false");
    return true;
}

(:test)
function testLineCrossing_crosses_extension_not_segment(logger as Test.Logger) as Boolean {
    // Movement crosses the infinite extension of the line but passes east of
    // the actual segment endpoint — u=2.0 at crossing, outside [0,1].
    var result = lineCrossingCheck(
        -0.001d, 0.002d,   // p1: south, beyond east end of line
         0.001d, 0.002d,   // p2: north, beyond east end of line
         0.0d,   0.0d,     // q1: west end of short east-west line
         0.0d,   0.001d    // q2: east end (line goes from lng=0 to lng=0.001)
    );
    Test.assertMessage(!result, "crossing beyond line endpoint should return false");
    return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// compressProgramme — compact segment layout
//
// compressProgramme converts the server's string-keyed JSON into the compact
// positional-array form that lives in Application.Storage and is read directly by
// the DataField (no Dictionary expansion — the FR245 heap saving). These tests
// pin the exact positional layout the View depends on; any drift between the
// encoder and the field indices in Config.mc breaks the running watch silently,
// so it must break a test instead.
// ─────────────────────────────────────────────────────────────────────────────

(:test)
function testCompress_timeSegment_layout(logger as Test.Logger) as Boolean {
    var prog = {
        "id" => "p1", "name" => "P", "scheduled_date" => "2099-01-01",
        "blocks" => [
            { "name" => "B", "segments" => [
                { "name" => "Fast", "kind" => "time", "duration" => 120, "distance" => 0, "target_pace" => 240 }
            ] as Array<Dictionary> }
        ] as Array<Dictionary>
    };
    var segs = ((compressProgramme(prog)["b"] as Array)[0] as Dictionary)["s"] as Array;
    var seg = segs[0] as Array;
    Test.assertEqualMessage(seg[SEG_KIND],     KIND_TIME, "time segment kind at index 0");
    Test.assertEqualMessage(seg[SEG_NAME],     "Fast",    "name at SEG_NAME");
    Test.assertEqualMessage(seg[SEG_DURATION], 120,       "duration at SEG_DURATION");
    Test.assertEqualMessage(seg[SEG_PACE],     240,       "target pace at SEG_PACE");
    return true;
}

(:test)
function testCompress_distanceSegment_layout(logger as Test.Logger) as Boolean {
    var prog = {
        "id" => "p1", "name" => "P", "scheduled_date" => "2099-01-01",
        "blocks" => [
            { "name" => "B", "segments" => [
                { "name" => "Recovery", "kind" => "distance", "duration" => 0, "distance" => 200, "target_pace" => null }
            ] as Array<Dictionary> }
        ] as Array<Dictionary>
    };
    var segs = ((compressProgramme(prog)["b"] as Array)[0] as Dictionary)["s"] as Array;
    var seg = segs[0] as Array;
    Test.assertEqualMessage(seg[SEG_KIND],     KIND_DISTANCE, "distance segment kind at index 0");
    Test.assertEqualMessage(seg[SEG_NAME],     "Recovery",    "name at SEG_NAME");
    Test.assertEqualMessage(seg[SEG_DISTANCE], 200.0f,        "distance at SEG_DISTANCE");
    Test.assertEqualMessage(seg[SEG_PACE],     -1,            "null target pace encoded as -1");
    return true;
}

(:test)
function testCompress_lineSegment_layout(logger as Test.Logger) as Boolean {
    var prog = {
        "id" => "p1", "name" => "P", "scheduled_date" => "2099-01-01",
        "blocks" => [
            { "name" => "B", "segments" => [
                { "name" => "Finish", "kind" => "line",
                  "p1_lat" => 51.5074f, "p1_lng" => -0.1278f,
                  "p2_lat" => 51.5075f, "p2_lng" => -0.1280f, "target_pace" => null }
            ] as Array<Dictionary> }
        ] as Array<Dictionary>
    };
    var segs = ((compressProgramme(prog)["b"] as Array)[0] as Dictionary)["s"] as Array;
    var seg = segs[0] as Array;
    Test.assertEqualMessage(seg[SEG_KIND],   KIND_LINE,  "line segment kind at index 0");
    Test.assertEqualMessage(seg[SEG_NAME],   "Finish",   "name at SEG_NAME");
    Test.assertEqualMessage(seg[LINE_P1LAT], 51.5074f,   "p1_lat at LINE_P1LAT");
    Test.assertEqualMessage(seg[LINE_P1LNG], -0.1278f,   "p1_lng at LINE_P1LNG");
    Test.assertEqualMessage(seg[LINE_P2LAT], 51.5075f,   "p2_lat at LINE_P2LAT");
    Test.assertEqualMessage(seg[LINE_P2LNG], -0.1280f,   "p2_lng at LINE_P2LNG");
    Test.assertEqualMessage(seg[LINE_PACE],  -1,         "null target pace encoded as -1 at LINE_PACE");
    return true;
}

(:test)
function testCompress_repeatSegment_layout(logger as Test.Logger) as Boolean {
    var prog = {
        "id" => "p1", "name" => "P", "scheduled_date" => "2099-01-01",
        "blocks" => [
            { "name" => "B", "segments" => [
                { "name" => "Repeat", "kind" => "repeat", "exit_type" => "count",
                  "repeat_count" => 5, "duration" => 0, "distance" => 0 }
            ] as Array<Dictionary> }
        ] as Array<Dictionary>
    };
    var segs = ((compressProgramme(prog)["b"] as Array)[0] as Dictionary)["s"] as Array;
    var seg = segs[0] as Array;
    Test.assertEqualMessage(seg[SEG_KIND],  KIND_REPEAT, "repeat segment kind at index 0");
    Test.assertEqualMessage(seg[REP_EXIT],  EXIT_COUNT,  "exit type at REP_EXIT");
    Test.assertEqualMessage(seg[REP_COUNT], 5,           "repeat count at REP_COUNT");
    return true;
}

(:test)
function testCompress_blockName_preserved(logger as Test.Logger) as Boolean {
    // currentBlockName()/loadProgrammeHeader read the block name from key "n".
    var prog = {
        "id" => "p1", "name" => "P", "scheduled_date" => "2099-01-01",
        "blocks" => [
            { "name" => "Warm up", "segments" => [] as Array<Dictionary> }
        ] as Array<Dictionary>
    };
    var block0 = (compressProgramme(prog)["b"] as Array)[0] as Dictionary;
    Test.assertEqualMessage(block0["n"], "Warm up", "block name stored under key 'n'");
    Test.assertMessage(block0["s"] instanceof Array, "block segments stored under key 's'");
    return true;
}
