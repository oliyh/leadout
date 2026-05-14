import Toybox.Application;
import Toybox.Background;
import Toybox.Lang;
import Toybox.System;

// Background service delegate — fires every 5 minutes via a temporal event.
// Reads the device_code from Application.Storage (written by App.initialize),
// calls /api/sync/:device_code, and on success passes today's programme back
// to the foreground via Background.exit so the view can update.
(:background)
class LeadoutServiceDelegate extends System.ServiceDelegate {

    function initialize() {
        ServiceDelegate.initialize();
    }

    function onTemporalEvent() as Void {
        var deviceCode = Application.Storage.getValue("device_code");
        if (!(deviceCode instanceof String)) {
            Background.exit(null);
            return;
        }
        var storedToken = Application.Storage.getValue("watch_token");
        var token = (storedToken instanceof String) ? storedToken as String : null;
        if (token == null) {
            makeTokenRequest(deviceCode as String, method(:onTokenResponse));
        } else {
            makeSyncRequest(deviceCode as String, token, method(:onSyncResponse));
        }
    }

    function onTokenResponse(responseCode as Number, data as Dictionary?) as Void {
        if (responseCode == 200 && data != null) {
            var token = data["token"];
            if (token instanceof String) {
                var t = token as String;
                Application.Storage.setValue("watch_token", t);
                var deviceCode = Application.Storage.getValue("device_code");
                if (deviceCode instanceof String) {
                    // Pass token directly rather than reading back from Storage (write may
                    // not be committed yet). Chain straight into sync so registration
                    // and first programme load happen in a single background run.
                    makeSyncRequest(deviceCode as String, t, method(:onSyncResponse));
                    return;
                }
            }
        }
        Background.exit(null);
    }

    function onSyncResponse(responseCode as Number, data as Dictionary?) as Void {
        if (responseCode == 200 && data != null) {
            var programmes = data["programmes"] as Array<Dictionary>;
            var prog = findNextProgramme(programmes);
            if (prog != null) {
                Application.Storage.setValue("programme", compressProgramme(prog as Dictionary));
                Application.Storage.setValue("lastSyncTime", System.getTimer());
                // Send a lightweight sentinel rather than the full nested dict.
                // Background.exit() on old SDK (CIQ < 5) does not reliably round-trip
                // Arrays of Dictionaries; the programme is already in Storage so the
                // foreground reads it from there via the "programme_ready" handler.
                Background.exit({"programme_ready" => true});
                return;
            }
            // No upcoming programme at all — signal which empty state to show.
            var subCount = data["subscription_count"];
            if (subCount instanceof Number && (subCount as Number) == 0) {
                Background.exit({ "no_subscriptions" => true });
            } else {
                Background.exit({ "no_programme" => true });
            }
            return;
        } else if (responseCode == 401) {
            // Token rejected — signal foreground to wipe token/code and re-register.
            Background.exit({ "auth_failed" => true });
            return;
        }
        Background.exit({ "sync_failed" => true });
    }

}
