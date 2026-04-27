import Toybox.Application;
import Toybox.Background;
import Toybox.Communications;
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
        Communications.makeWebRequest(
            API_BASE + "/api/sync/" + (deviceCode as String),
            null,
            {
                :method => Communications.HTTP_REQUEST_METHOD_GET,
                :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
            },
            method(:onSyncResponse)
        );
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
        } else if (responseCode == 404) {
            // Device was unregistered — signal the foreground to show re-registration screen.
            Background.exit({ "registration_required" => true });
            return;
        }
        Background.exit(null);
    }

}
