import Toybox.Lang;
import Toybox.Test;

// ── formatDuration ─────────────────────────────────────────────────────────────
// Tests for the module-level formatDuration function in Utils.mc.
// Spec reference: WatchDataField exposes segment countdown and next-segment
// duration in human-readable form; formatDuration is the rendering primitive.
//
// Pattern: Test.assertEqualMessage throws on failure; return true signals pass.

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
    // Remaining time goes negative briefly before compute() clamps it — must not show "-1:00".
    Test.assertEqualMessage(formatDuration(-1), "0:00", "negative clamped to 0:00");
    return true;
}

(:test)
function testFormatDuration_singleDigitSeconds(logger as Test.Logger) as Boolean {
    // Seconds must be zero-padded: 3:05 not 3:5
    Test.assertEqualMessage(formatDuration(185), "3:05", "seconds zero-padded");
    return true;
}
