import Toybox.Application;
import Toybox.Background;
import Toybox.Communications;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;
import Toybox.WatchUi;

class leadout_datafieldApp extends Application.AppBase {

    hidden var mView as leadout_datafieldView?;
    hidden var mDeviceCode as String = "";

    function initialize() {
        AppBase.initialize();
        // Stable per-device identifier — generated once, persisted forever.
        // Displayed on screen so the participant can register at /register.
        mDeviceCode = getOrCreateDeviceCode();
    }

    function onStart(state as Dictionary?) as Void {
        Background.registerForTemporalEvent(new Time.Duration(5 * 60));

        // Foreground sync on open. A failed sync never wipes local storage —
        // the view falls back to the last successfully cached programme.
        var url = API_BASE + "/api/sync/" + mDeviceCode;
        var modelName = System.getDeviceSettings().modelName;
        if (modelName != null) {
            url = url + "?model=" + Communications.encodeUrl(modelName);
        }
        Communications.makeWebRequest(
            url,
            null,
            {
                :method => Communications.HTTP_REQUEST_METHOD_GET,
                :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
            },
            method(:onSyncResponse)
        );
    }

    function onStop(state as Dictionary?) as Void {
    }

    function getServiceDelegate() as [System.ServiceDelegate] {
        return [new LeadoutServiceDelegate()];
    }

    function getInitialView() as [Views] or [Views, InputDelegates] {
        mView = new leadout_datafieldView();
        mView.setDeviceCode(mDeviceCode);
        return [mView];
    }

    // Called when the background temporal sync completes and passes back data.
    function onBackgroundData(data as Application.PersistableType) as Void {
        var view = mView;
        if (!(data instanceof Dictionary) || view == null) { return; }
        var dict = data as Dictionary;
        if (dict.hasKey("registration_required")) {
            view.setRegistrationRequired(mDeviceCode);
        } else if (dict.hasKey("no_subscriptions")) {
            view.setNoSubscriptions();
        } else if (dict.hasKey("no_programme")) {
            view.setNoProgramme();
        } else {
            view.setProgramme(dict);
        }
    }

    // Handles the response from /api/sync/:device_code.
    // 200 → { "programmes": [...], "subscription_count": N } — find today's and load it,
    //        or show the appropriate empty state.
    // 404 → device not registered — show code on screen.
    // Other → network error, keep whatever is cached.
    function onSyncResponse(responseCode as Number, data as Dictionary?) as Void {
        System.println("onSyncResponse: code=" + responseCode);
        var view = mView;
        if (responseCode == 200 && data != null) {
            var programmes = data["programmes"] as Array<Dictionary>;
            var prog = findTodaysProgramme(programmes);
            if (prog != null) {
                Application.Storage.setValue("programme", prog);
                Application.Storage.setValue("lastSyncTime", System.getTimer());
                if (view != null) {
                    view.setProgramme(prog as Dictionary);
                }
            } else if (view != null) {
                var subCount = data["subscription_count"];
                if (subCount instanceof Number && (subCount as Number) == 0) {
                    view.setNoSubscriptions();
                } else {
                    view.setNoProgramme();
                }
            }
        } else if (responseCode == 404) {
            if (view != null) {
                view.setRegistrationRequired(mDeviceCode);
            }
        } else {
            if (view != null) {
                view.setFetchFailed();
            }
        }

        // Retry any participation record that the immediate LAP-press POST may have missed.
        if (responseCode == 200) {
            var pendingId = Application.Storage.getValue("pending_participation_id");
            if (pendingId instanceof String) {
                Communications.makeWebRequest(
                    API_BASE + "/api/sessions/start",
                    { "device_code" => mDeviceCode, "programme_id" => pendingId as String },
                    {
                        :method       => Communications.HTTP_REQUEST_METHOD_POST,
                        :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON,
                        :headers      => { "Content-Type" => "application/json" }
                    },
                    method(:onParticipationRetryResponse)
                );
                Application.Storage.deleteValue("pending_participation_id");
            }
        }
    }

    function onParticipationRetryResponse(responseCode as Number, data as Dictionary?) as Void {
        System.println("participation retry: " + responseCode);
    }

}

function getApp() as leadout_datafieldApp {
    return Application.getApp() as leadout_datafieldApp;
}
