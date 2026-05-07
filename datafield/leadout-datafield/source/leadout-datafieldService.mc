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
            // Device code not yet generated (app never opened foreground). Skip.
            Background.exit(null);
            return;
        }
        var watchToken = Application.Storage.getValue("watch_token");
        if (!(watchToken instanceof String)) {
            // Token not yet claimed — foreground handles token polling. Skip.
            Background.exit(null);
            return;
        }
        makeSyncRequest(deviceCode as String, method(:onSyncResponse));
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
