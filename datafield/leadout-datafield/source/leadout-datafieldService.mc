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
                Application.Storage.setValue("watch_token", token as String);
            }
        }
        // Don't chain into sync here — the storage write may not be committed until
        // Background.exit fires, so a same-run sync would go without auth and trigger
        // an auth_failed wipe. The next temporal event will pick up the token and sync.
        Background.exit(null);
    }

    function onSyncResponse(responseCode as Number, data as Dictionary?) as Void {
        if (responseCode == 200 && data != null) {
            var programmes = data["programmes"] as Array<Dictionary>;
            var prog = findTodaysProgramme(programmes);
            if (prog != null) {
                Application.Storage.setValue("programme", prog);
                Application.Storage.setValue("lastSyncTime", System.getTimer());
                Background.exit(prog);
                return;
            }
            // Registered but no programme today — signal which empty state to show.
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
        Background.exit(null);
    }

}
