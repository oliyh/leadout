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

// Issues a GET /api/sync/:deviceCode request. Includes token as a Bearer Authorization
// header if non-null. The callback receives (responseCode, data).
// Used by the foreground open sync, the background temporal sync, and the post-token sync.
(:background)
function makeSyncRequest(deviceCode as String, token as String?, callback as Method) as Void {
    var distUnits = System.getDeviceSettings().distanceUnits == System.UNIT_METRIC ? "metric" : "statute";
    var headers = (token != null)
        ? { "Authorization" => "Bearer " + (token as String) }
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

// Clears watch_token and programme from storage on a 401 response.
// If a token was present (rejected by server), also clears device_code and returns true
// so the caller knows to generate a new one. Returns false when no token was stored —
// meaning the 401 is a first-time "not yet registered" case and device_code is still valid.
(:background)
function clearAuthState() as Boolean {
    var hadToken = Application.Storage.getValue("watch_token") instanceof String;
    Application.Storage.deleteValue("watch_token");
    Application.Storage.deleteValue("programme");
    if (hadToken) {
        Application.Storage.deleteValue("device_code");
    }
    return hadToken;
}

// Returns true if the device runs Connect IQ API < 5.0.
// On older firmware, DataFields cannot call makeWebRequest from foreground context and
// Communications.openWebPage is unavailable. These are uncatchable runtime errors, so
// the flag must be checked before attempting the call.
(:background)
function isOldSdk() as Boolean {
    var settings = System.getDeviceSettings();
    if (!(settings has :monkeyVersion)) { return true; }
    var ver = settings.monkeyVersion as Array<Number>;
    return ver[0] < 5;
}

// Returns the index of the first segment in the repeat group whose marker is
// at repeatIdx. Scans backwards for a previous repeat marker; the group starts
// at (previous marker index + 1), or 0 if none exists.
// segments is the compact form: an Array of positional segment Arrays.
function repeatGroupStart(segments as Array, repeatIdx as Number) as Number {
    for (var i = repeatIdx - 1; i >= 0; i--) {
        if ((segments[i] as Array)[SEG_KIND] as Number == KIND_REPEAT) {
            return i + 1;
        }
    }
    return 0;
}

// Returns the index of the next real (non-repeat-marker) segment after currentIdx,
// or segments.size() if none remain in this block.
// segments is the compact form: an Array of positional segment Arrays.
function nextSegmentIndex(segments as Array, currentIdx as Number) as Number {
    var idx = currentIdx + 1;
    while (idx < segments.size() && ((segments[idx] as Array)[SEG_KIND] as Number == KIND_REPEAT)) {
        idx++;
    }
    return idx;
}

// Returns the name to preview as "up next": the segment at nextIdx if one exists
// in this block, otherwise the name of the following block, otherwise null when
// this is the last segment of the last block.
// blocks is an Array of Dictionary, each shaped {"n" => name, "s" => segments}.
function segmentPreviewName(
    segments        as Array,
    nextIdx         as Number,
    blocks          as Array,
    currentBlockIdx as Number
) as String? {
    if (nextIdx < segments.size()) {
        return (segments[nextIdx] as Array)[SEG_NAME] as String;
    }
    if (currentBlockIdx < blocks.size() - 1) {
        return (blocks[currentBlockIdx + 1] as Dictionary)["n"] as String;
    }
    return null;
}

// Returns true when the current segment is within its final `thresholdSecs` seconds
// and thus its name display should switch to previewing the next segment.
// Only meaningful for time-based segments — callers pass -1 for distance/line segments.
function inFinalCountdown(timeRemaining as Number, thresholdSecs as Number) as Boolean {
    return timeRemaining > 0 && timeRemaining <= thresholdSecs;
}

// Distance counterpart to inFinalCountdown: true when the current segment is within
// its final `thresholdM` metres. Callers pass -1.0 for segments with no distance
// remaining (time-based, or a finish line with no GPS fix yet).
function inFinalStretch(distRemaining as Float, thresholdM as Float) as Boolean {
    return distRemaining > 0.0f && distRemaining <= thresholdM;
}

// Approximate straight-line distance in metres between two lat/lng points, using an
// equirectangular projection centred on (toLat, toLng). Accurate within ~10 km — the
// same approximation lineCrossingCheck uses for finish-line geometry.
function distanceToPointM(fromLat as Double, fromLng as Double, toLat as Double, toLng as Double) as Float {
    var cosLat = Math.cos(toLat * Math.PI / 180.0d);
    var kLat = 111320.0d;
    var kLng = 111320.0d * cosLat;
    var dx = (fromLng - toLng) * kLng;
    var dy = (fromLat - toLat) * kLat;
    return Math.sqrt(dx * dx + dy * dy).toFloat();
}

// Returns true when the repeat exit condition encoded in seg is satisfied.
// seg:          a compact repeat segment array [KIND_REPEAT, exit_type, repeat_count, duration, distance].
// currentRep:   1-based index of the rep just completed.
// elapsedMs:    milliseconds elapsed since the group began.
// coveredDistM: metres covered since the group began.
function shouldExitRepeat(
    seg          as Array,
    currentRep   as Number,
    elapsedMs    as Number,
    coveredDistM as Float
) as Boolean {
    var exitType = seg[REP_EXIT] as Number;
    if (exitType == EXIT_COUNT) {
        return currentRep >= (seg[REP_COUNT] as Number);
    }
    if (exitType == EXIT_TIME) {
        return elapsedMs / 1000 >= (seg[REP_DURATION] as Number);
    }
    if (exitType == EXIT_DISTANCE) {
        return coveredDistM >= (seg[REP_DISTANCE] as Float);
    }
    return false;
}

// Returns true if the GPS movement path from (p1Lat,p1Lng) to (p2Lat,p2Lng) crosses the
// finish line defined by endpoints (q1Lat,q1Lng) and (q2Lat,q2Lng). All coordinates in
// decimal degrees. Uses equirectangular projection centred on q1 — accurate within ~10 km.
function lineCrossingCheck(
    p1Lat as Double, p1Lng as Double,
    p2Lat as Double, p2Lng as Double,
    q1Lat as Double, q1Lng as Double,
    q2Lat as Double, q2Lng as Double
) as Boolean {
    var cosLat = Math.cos(q1Lat * Math.PI / 180.0d);
    var kLat = 111320.0d;
    var kLng = 111320.0d * cosLat;

    var ax = (p1Lng - q1Lng) * kLng;
    var ay = (p1Lat - q1Lat) * kLat;
    var bx = (p2Lng - q1Lng) * kLng;
    var by = (p2Lat - q1Lat) * kLat;
    var cx = (q2Lng - q1Lng) * kLng;
    var cy = (q2Lat - q1Lat) * kLat;

    var dMx = bx - ax;
    var dMy = by - ay;
    var denom = dMx * cy - dMy * cx;
    if (denom == 0.0d) { return false; }

    var t = (-ax * cy + ay * cx) / denom;
    var u = (-ax * dMy + ay * dMx) / denom;
    return t >= 0.0d && t <= 1.0d && u >= 0.0d && u <= 1.0d;
}

// Converts a raw server programme Dictionary into a compact form for Storage.
// Uses 1-2 char keys and encodes segments as Arrays to minimise heap cost
// when the stored value is later deserialised.
//
// Compact segment array layout:
//   time/distance:  [kind, name, duration, distance, target_pace]
//   repeat:         [2,    exit_type_int, repeat_count, duration, distance]
// kind:      0=time  1=distance  2=repeat
// exit_type: 0=count 1=time      2=distance
// target_pace: -1 means none (avoids null in arrays for old-SDK compatibility)
(:background)
function compressProgramme(data as Dictionary) as Dictionary {
    var rawBlocks = data["blocks"];
    var compBlocks = [] as Array<Dictionary>;
    if (rawBlocks instanceof Array) {
        var jsonBlocks = rawBlocks as Array<Dictionary>;
        for (var i = 0; i < jsonBlocks.size(); i++) {
            var jb = jsonBlocks[i] as Dictionary;
            var compSegs = [] as Array<Array<Object>>;
            var jsonSegs = jb["segments"];
            if (jsonSegs instanceof Array) {
                var segs = jsonSegs as Array<Dictionary>;
                for (var j = 0; j < segs.size(); j++) {
                    var js = segs[j] as Dictionary;
                    var kindStr = (js["kind"] instanceof String) ? js["kind"] as String : "time";
                    if (kindStr.equals("repeat")) {
                        var exitStr = (js["exit_type"] instanceof String) ? js["exit_type"] as String : "count";
                        var exitInt = exitStr.equals("time") ? EXIT_TIME : exitStr.equals("distance") ? EXIT_DISTANCE : EXIT_COUNT;
                        var repDist = (js["distance"] instanceof Float)  ? js["distance"] as Float :
                                      (js["distance"] instanceof Number) ? (js["distance"] as Number).toFloat() : 0.0f;
                        compSegs.add([
                            KIND_REPEAT, exitInt,
                            (js["repeat_count"] instanceof Number) ? js["repeat_count"] as Number : 1,
                            (js["duration"]     instanceof Number) ? js["duration"]     as Number : 0,
                            repDist
                        ] as Array<Object>);
                    } else if (kindStr.equals("line")) {
                        var p1LatRaw = js["p1_lat"];
                        var p1LngRaw = js["p1_lng"];
                        var p2LatRaw = js["p2_lat"];
                        var p2LngRaw = js["p2_lng"];
                        var p1Lat = (p1LatRaw instanceof Float)  ? p1LatRaw as Float :
                                    (p1LatRaw instanceof Number) ? (p1LatRaw as Number).toFloat() : 0.0f;
                        var p1Lng = (p1LngRaw instanceof Float)  ? p1LngRaw as Float :
                                    (p1LngRaw instanceof Number) ? (p1LngRaw as Number).toFloat() : 0.0f;
                        var p2Lat = (p2LatRaw instanceof Float)  ? p2LatRaw as Float :
                                    (p2LatRaw instanceof Number) ? (p2LatRaw as Number).toFloat() : 0.0f;
                        var p2Lng = (p2LngRaw instanceof Float)  ? p2LngRaw as Float :
                                    (p2LngRaw instanceof Number) ? (p2LngRaw as Number).toFloat() : 0.0f;
                        var pace = (js["target_pace"] instanceof Number) ? (js["target_pace"] as Number) : -1;
                        compSegs.add([
                            KIND_LINE,
                            (js["name"] instanceof String) ? js["name"] as String : "",
                            p1Lat, p1Lng, p2Lat, p2Lng,
                            pace
                        ] as Array<Object>);
                    } else {
                        var kindInt = kindStr.equals("distance") ? KIND_DISTANCE : KIND_TIME;
                        var segDist = (js["distance"] instanceof Float)  ? js["distance"] as Float :
                                      (js["distance"] instanceof Number) ? (js["distance"] as Number).toFloat() : 0.0f;
                        var pace = (js["target_pace"] instanceof Number) ? (js["target_pace"] as Number) : -1;
                        compSegs.add([
                            kindInt,
                            (js["name"] instanceof String) ? js["name"] as String : "",
                            (js["duration"] instanceof Number) ? js["duration"] as Number : 0,
                            segDist,
                            pace
                        ] as Array<Object>);
                    }
                }
            }
            compBlocks.add({"n" => (jb["name"] instanceof String) ? jb["name"] as String : "", "s" => compSegs} as Dictionary);
        }
    }
    return {
        "i" => (data["id"]             instanceof String) ? data["id"]             as String : "",
        "n" => (data["name"]           instanceof String) ? data["name"]           as String : "",
        "d" => (data["scheduled_date"] instanceof String) ? data["scheduled_date"] as String : "",
        "b" => compBlocks
    };
}

// Returns true when actualSec is within 10% of targetSec (and a real reading exists).
// actualSec = 0 means no GPS signal — never considered on-target.
function isPaceOnTarget(actualSec as Number, targetSec as Number) as Boolean {
    return actualSec > 0 && (actualSec - targetSec).abs() <= targetSec / 10;
}

// Converts "YYYY-MM-DD" to an integer YYYYMMDD for ordering.
// String.compareTo() is not available on CIQ 3.3, so numeric comparison is used instead.
// Lexicographic order equals chronological order for this fixed format.
(:background)
function dateToInt(d as String) as Number {
    return ((d.substring(0, 4) as String) + (d.substring(5, 7) as String) + (d.substring(8, 10) as String)).toNumber() as Number;
}

// Finds the next upcoming programme (earliest scheduled_date >= today).
// Returns null if the array is empty. The array items are raw server Dictionaries.
(:background)
function findNextProgramme(programmes as Array<Dictionary>) as Dictionary? {
    var tInt = dateToInt(todayDateString());
    var best = null;
    var bestInt = 0;
    for (var i = 0; i < programmes.size(); i++) {
        var p = programmes[i] as Dictionary;
        var dInt = dateToInt(p["scheduled_date"] as String);
        if (dInt >= tInt) {
            if (best == null || dInt < bestInt) {
                best = p;
                bestInt = dInt;
            }
        }
    }
    return best;
}
