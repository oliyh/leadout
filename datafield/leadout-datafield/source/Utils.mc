import Toybox.Application;
import Toybox.Communications;
import Toybox.Lang;
import Toybox.Math;
import Toybox.System;
import Toybox.Time;
import Toybox.Time.Gregorian;

// Formats a duration in whole seconds as M:SS (e.g. 125 → "2:05").
// Negative values are clamped to "0:00".
(:background)
function formatDuration(secs as Number) as String {
    if (secs < 0) { secs = 0; }
    return (secs / 60).format("%d") + ":" + (secs % 60).format("%02d");
}

// Returns today's date as an ISO-8601 string "YYYY-MM-DD" in local time.
// Used to match programme.scheduled_date from the server.
(:background)
function todayDateString() as String {
    var d = Gregorian.info(Time.now(), Time.FORMAT_SHORT);
    return d.year.format("%04d") + "-" + d.month.format("%02d") + "-" + d.day.format("%02d");
}

// Generates a random 6-character device code using unambiguous uppercase
// alphanumerics (no 0/O, 1/I/L). Stored persistently in Application.Storage
// on first call; subsequent calls return the stored value.
(:background)
function getOrCreateDeviceCode() as String {
    var stored = Application.Storage.getValue("device_code");
    if (stored instanceof String) {
        return stored as String;
    }
    var alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    var code = "";
    for (var i = 0; i < 6; i++) {
        var idx = Math.rand().abs() % 31;
        code = code + alphabet.substring(idx, idx + 1);
    }
    Application.Storage.setValue("device_code", code);
    return code;
}

// Issues a GET /api/sync/:deviceCode request. Reads watch_token from Application.Storage
// and includes it as an Authorization header. The callback receives (responseCode, data).
// Used by the foreground open sync, the background temporal sync, and the post-token sync.
(:background)
function makeSyncRequest(deviceCode as String, callback as Method) as Void {
    var distUnits = System.getDeviceSettings().distanceUnits == System.UNIT_METRIC ? "metric" : "statute";
    var watchToken = Application.Storage.getValue("watch_token");
    var headers = (watchToken instanceof String)
        ? { "Authorization" => "Bearer " + (watchToken as String) }
        : {} as Dictionary<String, String>;
    Communications.makeWebRequest(
        API_BASE + "/api/sync/" + deviceCode,
        { "model"           => System.getDeviceSettings().partNumber,
          "app_version"     => APP_VERSION,
          "distance_units"  => distUnits },
        { :method       => Communications.HTTP_REQUEST_METHOD_GET,
          :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON,
          :headers      => headers },
        callback
    );
}

// Polls GET /api/devices/:deviceCode/token. No auth required.
// 202 = not yet registered; 200 { token } = token claimed; 410 = already claimed.
// Used from STATE_UNREGISTERED to detect when the web app has registered the device.
(:background)
function makeTokenRequest(deviceCode as String, callback as Method) as Void {
    Communications.makeWebRequest(
        API_BASE + "/api/devices/" + deviceCode + "/token",
        null,
        { :method       => Communications.HTTP_REQUEST_METHOD_GET,
          :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON },
        callback
    );
}

// Finds the first programme in an array whose scheduled_date is today.
// Returns null if none is found. The array items are raw server Dictionaries.
(:background)
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
