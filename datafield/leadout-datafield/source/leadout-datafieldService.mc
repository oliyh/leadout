import Toybox.Application;
import Toybox.Background;
import Toybox.Communications;
import Toybox.Lang;
import Toybox.System;

// Background service delegate — fires every 5 minutes via a temporal event
// registered in App.onStart. Syncs the programme from the server into
// Application.Storage so the data field can read it without network access.
//
// NOTE: For data fields, background temporal events only fire while the
// corresponding native activity app is running. This is the primary assumption
// this spike is testing.
(:background)
class LeadoutServiceDelegate extends System.ServiceDelegate {

    function initialize() {
        ServiceDelegate.initialize();
    }

    function onTemporalEvent() as Void {
        Communications.makeWebRequest(
            API_BASE + "/api/public/programme/latest",
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
            Application.Storage.setValue("programme", data);
            Application.Storage.setValue("lastSyncTime", System.getTimer());
            Background.exit(data);
        } else {
            Background.exit(null);
        }
    }

}
