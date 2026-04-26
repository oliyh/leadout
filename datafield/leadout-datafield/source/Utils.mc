import Toybox.Application;
import Toybox.Lang;
import Toybox.Math;
import Toybox.Time;
import Toybox.Time.Gregorian;

// Formats a duration in whole seconds as M:SS (e.g. 125 → "2:05").
// Negative values are clamped to "0:00".
function formatDuration(secs as Number) as String {
    if (secs < 0) { secs = 0; }
    return (secs / 60).format("%d") + ":" + (secs % 60).format("%02d");
}

// Returns today's date as an ISO-8601 string "YYYY-MM-DD" in local time.
// Used to match programme.scheduled_date from the server.
function todayDateString() as String {
    var d = Gregorian.info(Time.now(), Time.FORMAT_SHORT);
    return d.year.format("%04d") + "-" + d.month.format("%02d") + "-" + d.day.format("%02d");
}

// Generates a random 6-character device code using unambiguous uppercase
// alphanumerics (no 0/O, 1/I/L). Stored persistently in Application.Storage
// on first call; subsequent calls return the stored value.
function getOrCreateDeviceCode() as String {
    var stored = Application.Storage.getValue("device_code");
    if (stored instanceof String) {
        return stored as String;
    }
    var alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    var code = "";
    for (var i = 0; i < 6; i++) {
        var idx = (Math.rand() as Long).abs().toNumber() % 32;
        code = code + alphabet.substring(idx, idx + 1);
    }
    Application.Storage.setValue("device_code", code);
    return code;
}

// Finds the first programme in an array whose scheduled_date is today.
// Returns null if none is found. The array items are raw server Dictionaries.
function findTodaysProgramme(programmes as Array<Dictionary>) as Dictionary? {
    var t = todayDateString();
    for (var i = 0; i < programmes.size(); i++) {
        var p = programmes[i] as Dictionary;
        if ((p["scheduled_date"] as String).equals(t)) {
            return p;
        }
    }
    return null;
}
