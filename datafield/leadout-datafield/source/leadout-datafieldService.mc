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
        System.println("[Service.onTemporalEvent] deviceCode=" + deviceCode);
        if (!(deviceCode instanceof String)) {
            System.println("[Service.onTemporalEvent] no device code — exiting background");
            Background.exit(null);
            return;
        }
        var storedToken = Application.Storage.getValue("watch_token");
        var token = (storedToken instanceof String) ? storedToken as String : null;
        System.println("[Service.onTemporalEvent] hasToken=" + (token != null));
        if (token == null) {
            System.println("[Service.onTemporalEvent] no token — requesting token");
            makeTokenRequest(deviceCode as String, method(:onTokenResponse));
        } else {
            System.println("[Service.onTemporalEvent] has token — making sync request");
            makeSyncRequest(deviceCode as String, token, method(:onSyncResponse));
        }
    }

    function onTokenResponse(responseCode as Number, data as Dictionary?) as Void {
        System.println("[Service.onTokenResponse] code=" + responseCode);
        if (responseCode == Communications.SECURE_CONNECTION_REQUIRED) {
            System.println("[Service.onTokenResponse] Need an https connection (or disable require https in the sim settings)");
        }
        // if code is -1001 
        if (responseCode == 200 && data != null) {
            var token = data["token"];
            if (token instanceof String) {
                System.println("[Service.onTokenResponse] token received — storing");
                Application.Storage.setValue("watch_token", token as String);
            } else {
                System.println("[Service.onTokenResponse] 200 but no token field in response");
            }
        }
        // Don't chain into sync here — the storage write may not be committed until
        // Background.exit fires, so a same-run sync would go without auth and trigger
        // an auth_failed wipe. The next temporal event will pick up the token and sync.
        System.println("[Service.onTokenResponse] exiting background");
        Background.exit(null);
    }

    function onSyncResponse(responseCode as Number, data as Dictionary?) as Void {
        System.println("[Service.onSyncResponse] responseCode: " + responseCode);
        if (responseCode == 200 && data != null) {
            var programmes = data["programmes"] as Array<Dictionary>;
            var prog = findTodaysProgramme(programmes);
            if (prog != null) {
                Application.Storage.setValue("programme", prog);
                Application.Storage.setValue("lastSyncTime", System.getTimer());
                // Send a lightweight sentinel rather than the full nested dict.
                // Background.exit() on old SDK (CIQ < 5) does not reliably round-trip
                // Arrays of Dictionaries; the programme is already in Storage so the
                // foreground reads it from there via the "programme_ready" handler.
                Background.exit({"programme_ready" => true});
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
        Background.exit({ "sync_failed" => true });
    }

}
