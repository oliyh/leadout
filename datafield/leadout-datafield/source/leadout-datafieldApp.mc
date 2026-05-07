import Toybox.Application;
import Toybox.Background;
import Toybox.Communications;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;
import Toybox.WatchUi;

(:background)
class leadout_datafieldApp extends Application.AppBase {

    hidden var mView as leadout_datafieldView?;
    hidden var mDeviceCode as String = "";

    function initialize() {
        AppBase.initialize();
        // Stable per-device identifier — generated once, persisted forever.
        // Displayed on screen so the participant can register at /register.
        mDeviceCode = getOrCreateDeviceCode();
        System.println("Device code=" + mDeviceCode);
        Background.registerForTemporalEvent(new Time.Duration(syncPeriodSeconds()));
    }

    function onStart(state as Dictionary?) as Void {
        // Foreground sync on open. A failed sync never wipes local storage —
        // the view falls back to the last successfully cached programme.
        makeSyncRequest(mDeviceCode, method(:onSyncResponse));
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
        if (dict.hasKey("auth_failed")) {
            handleAuthFailure();
        } else if (dict.hasKey("registration_required")) {
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
    // 401 → token missing or invalid — wipe token and device code, re-register.
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
        } else if (responseCode == 401) {
            handleAuthFailure();
        } else {
            var msg = "";
            if (data instanceof Dictionary) {
                var errVal = (data as Dictionary)["error"];
                if (errVal instanceof String) { msg = errVal as String; }
            }
            if (view != null) {
                view.setFetchFailed(responseCode, msg);
            }
        }

        // Retry any participation record that the immediate LAP-press POST may have missed.
        if (responseCode == 200) {
            var pendingId = Application.Storage.getValue("pending_participation_id");
            if (pendingId instanceof String) {
                var watchToken = Application.Storage.getValue("watch_token");
                var headers = { "Content-Type" => "application/json" } as Dictionary<String, String>;
                if (watchToken instanceof String) {
                    headers["Authorization"] = "Bearer " + (watchToken as String);
                }
                Communications.makeWebRequest(
                    API_BASE + "/api/sessions/start",
                    { "device_code" => mDeviceCode, "programme_id" => pendingId as String },
                    {
                        :method       => Communications.HTTP_REQUEST_METHOD_POST,
                        :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON,
                        :headers      => headers
                    },
                    method(:onParticipationRetryResponse)
                );
                Application.Storage.deleteValue("pending_participation_id");
            }
        }
    }

    // Clears the watch token and device code, generates a new device code, and
    // enters the registration flow. Called whenever the server returns 401.
    function handleAuthFailure() as Void {
        Application.Storage.deleteValue("watch_token");
        Application.Storage.deleteValue("device_code");
        Application.Storage.deleteValue("programme");
        mDeviceCode = getOrCreateDeviceCode();
        var view = mView;
        if (view != null) {
            view.setDeviceCode(mDeviceCode);
            view.setRegistrationRequired(mDeviceCode);
        }
    }

    function onParticipationRetryResponse(responseCode as Number, data as Dictionary?) as Void {
        System.println("participation retry: " + responseCode);
    }

    hidden function syncPeriodSeconds() as Number {
        var freq = Application.Properties.getValue("SyncFrequency");
        var minutes = (freq instanceof Number) ? (freq as Number) : 60;
        if (minutes < 5) { minutes = 5; }
        return minutes * 60;
    }

    // Called when the user toggles a setting via Garmin Connect / GCM.
    // The "Reset Leadout" boolean clears all stored state and restarts sync.
    function onSettingsChanged() as Void {
        var reset = Application.Properties.getValue("ResetState");
        if (reset instanceof Boolean && reset as Boolean) {
            Application.Storage.deleteValue("watch_token");
            Application.Storage.deleteValue("device_code");
            Application.Storage.deleteValue("programme");
            Application.Storage.deleteValue("lastSyncTime");
            Application.Storage.deleteValue("pending_participation_id");
            Application.Properties.setValue("ResetState", false);
            mDeviceCode = getOrCreateDeviceCode();
            var view = mView;
            if (view != null) {
                view.setDeviceCode(mDeviceCode);
                view.reset();
            }
            makeSyncRequest(mDeviceCode, method(:onSyncResponse));
        }
        Background.registerForTemporalEvent(new Time.Duration(syncPeriodSeconds()));
    }

}

function getApp() as leadout_datafieldApp {
    return Application.getApp() as leadout_datafieldApp;
}
