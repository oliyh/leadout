import Toybox.Lang;

// Formats a duration in whole seconds as M:SS (e.g. 125 → "2:05").
// Negative values are clamped to "0:00".
function formatDuration(secs as Number) as String {
    if (secs < 0) { secs = 0; }
    return (secs / 60).format("%d") + ":" + (secs % 60).format("%02d");
}
